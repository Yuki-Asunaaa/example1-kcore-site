import { NetworkGraph } from './graph.js';

const $ = id => document.getElementById(id);
let data = null;
let graph = null;
let shell = null;
let selected = null;
let step = 0;
let timer = null;
let downloadUrl = null;
let loading = false;

function chip(id) {
  const button = document.createElement('button');
  button.className = 'chip'; button.textContent = id;
  button.setAttribute('aria-label', `查看节点 ${id}`);
  button.addEventListener('click', () => selectNode(id));
  return button;
}

function selectNode(id) { selected = id; render(); }

function stop() {
  if (timer !== null) clearInterval(timer);
  timer = null;
  $('play').querySelector('span').textContent = step === data?.peeling_steps.length ? '重新播放' : '自动播放';
  $('play').querySelector('path').setAttribute('d', 'm8 5 11 7-11 7Z');
}

function setStep(value) {
  stop(); shell = null;
  step = Math.max(0, Math.min(data.peeling_steps.length, value));
  if (step > 0) selected = data.peeling_steps[step - 1].node;
  render();
}

function chooseShell(value) {
  stop(); step = 0; shell = value;
  render();
}

function render() {
  if (!data || !graph) return;
  const removed = new Set(data.peeling_steps.slice(0, step).map(item => item.node));
  graph.update({ shell, selected, removed });
  const remainingLinks = data.links.filter(link => !removed.has(link.source) && !removed.has(link.target));
  $('visible-count').textContent = step ? `剩余 ${data.nodes.length - step} 节点 · ${remainingLinks.length} 边` : '点击节点查看详情';
  $('removed-legend').hidden = !step;
  $('view-state').textContent = step ? `剥离演示 · 第 ${step} 步` : shell === null ? '原始网络' : `核数 k = ${shell} 高亮`;
  $('view-state').classList.toggle('active', shell !== null);
  $('filter-summary').textContent = shell === null ? `未筛选 · 共 ${data.nodes.length} 个节点` : `核数为 ${shell} · ${data.shells[String(shell)].length} 个节点`;
  $('filter-members').replaceChildren(...(shell === null ? [] : data.shells[String(shell)].map(chip)));
  $('shell-buttons').querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.k) === shell)));
  const node = data.nodes.find(item => item.id === selected);
  $('node-empty').hidden = !!node; $('node-details').hidden = !node;
  $('node-index').textContent = node ? `NODE ${String(node.id).padStart(2, '0')}` : '未选择';
  if (node) {
    $('node-degree').textContent = node.degree;
    $('node-core').textContent = node.core_number;
    const neighbors = data.links.flatMap(link => link.source === selected ? [link.target] : link.target === selected ? [link.source] : []).sort((a, b) => a - b);
    $('node-state').textContent = removed.has(selected) ? '已从演示网络移除；这里保留原图信息。' : step ? `当前剩余度 ${neighbors.filter(id => !removed.has(id)).length} · 核数为最终计算结果。` : `属于 ${node.core_number}-core，无法进入更高阶核心。`;
    $('neighbor-count').textContent = neighbors.length ? `(${neighbors.length})` : '(孤立点)';
    $('neighbors').replaceChildren(...neighbors.map(chip));
  }
  $('steps').querySelectorAll('button').forEach((button, index) => {
    button.classList.toggle('done', index < step);
    button.classList.toggle('current', index === step - 1);
    if (index === step - 1) button.setAttribute('aria-current', 'step');
    else button.removeAttribute('aria-current');
  });
  $('step-number').textContent = String(step).padStart(2, '0');
  $('step-count').textContent = `${step} / ${data.peeling_steps.length} 步`;
  if (timer === null) $('play').querySelector('span').textContent = step === data.peeling_steps.length ? '重新播放' : '自动播放';
  $('previous').disabled = step === 0;
  $('next').disabled = step === data.peeling_steps.length;
  $('reset-steps').disabled = step === 0;
  if (step === 0) {
    $('step-title').textContent = '从完整网络开始';
    $('step-description').textContent = '点击“下一步”或任一步骤，观察节点移除后的网络。';
  } else {
    const current = data.peeling_steps[step - 1];
    $('step-title').textContent = `移除节点 ${current.node}${step === data.peeling_steps.length ? ' · 分解完成' : ''}`;
    $('step-description').textContent = `删除时剩余度 ${current.degree_at_removal}，最终核数 ${current.core_number}。${current.degree_at_removal < current.core_number ? '核数沿用此前达到的最大值，不随剩余度下降。' : '并列最小度时，优先移除编号较小的节点。'}`;
  }
}

function populate() {
  $('graph-stats').textContent = `${data.nodes.length} 节点 / ${data.links.length} 条边`;
  $('source-file').textContent = data.metadata.source_file;
  $('shell-buttons').replaceChildren(...data.metadata.available_shells.map(k => {
    const button = document.createElement('button');
    button.className = 'shell-button'; button.dataset.k = k;
    button.setAttribute('aria-label', `高亮核数为 ${k} 的节点`);
    const strong = document.createElement('strong'); strong.textContent = `k = ${k}`;
    const small = document.createElement('small'); small.textContent = `${data.shells[String(k)].length} 个节点`;
    button.append(strong, small); button.addEventListener('click', () => chooseShell(k));
    return button;
  }));
  $('steps').replaceChildren(...data.peeling_steps.map((item, index) => {
    const button = document.createElement('button'); button.className = 'step';
    button.setAttribute('aria-label', `第 ${index + 1} 步：移除节点 ${item.node}`);
    const small = document.createElement('small'); small.textContent = `第 ${String(index + 1).padStart(2, '0')} 步`;
    const strong = document.createElement('strong'); strong.textContent = item.node;
    button.append(small, strong); button.addEventListener('click', () => setStep(index + 1));
    return button;
  }));
  const example = data.nodes.find(node => node.degree > node.core_number) || data.nodes[0];
  $('example-label').textContent = `看看节点 ${example.id} 的情况`;
  $('example-node').onclick = () => selectNode(example.id);
  const k = data.metadata.max_core;
  $('core-example').textContent = `本图的 ${k}-core 包含 ${data.cores[String(k)].length} 个节点。`;
  if (downloadUrl) URL.revokeObjectURL(downloadUrl);
  downloadUrl = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2) + '\n'], { type: 'application/json' }));
  $('download').href = downloadUrl; $('download').download = 'kcore-result.json';
}

async function load() {
  if (loading) return;
  loading = true; stop();
  $('reload').disabled = true; $('retry').disabled = true;
  $('error').hidden = true; $('application').hidden = true; $('loading').hidden = false;
  $('connection').className = 'connection'; $('connection').textContent = '正在读取结果';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch('graph.json', { signal: controller.signal, cache: 'no-store' });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || '数据接口返回异常，请重试。');
    if (!window.d3) throw new Error('D3 文件加载失败，请检查 frontend/vendor 目录后刷新。');
    if (!Array.isArray(payload.nodes) || !payload.nodes.length || !Array.isArray(payload.links) || !payload.shells || !payload.cores || !payload.peeling_steps || !payload.metadata) throw new Error('案例结果的数据结构不完整。');
    data = payload; shell = null; selected = null; step = 0;
    if (graph) graph.destroy();
    populate();
    $('application').hidden = false;
    graph = new NetworkGraph($('graph-container'), $('network'), data, selectNode, scale => { $('zoom-label').textContent = `${Math.round(scale * 100)}%`; });
    render(); stop();
    $('connection').className = 'connection connected'; $('connection').textContent = '已连接 · 计算完成';
  } catch (error) {
    $('error').hidden = false;
    $('error-message').textContent = error.name === 'AbortError' ? '读取结果超时，请刷新网页重试。' : error instanceof TypeError ? '无法读取案例结果文件，请刷新网页重试。' : error.message;
    $('connection').className = 'connection failed'; $('connection').textContent = '连接异常';
  } finally {
    clearTimeout(timeout); loading = false;
    $('loading').hidden = true; $('reload').disabled = false; $('retry').disabled = false;
  }
}

$('reload').addEventListener('click', load);
$('retry').addEventListener('click', load);
$('clear').addEventListener('click', () => { selected = null; chooseShell(null); });
$('previous').addEventListener('click', () => setStep(step - 1));
$('next').addEventListener('click', () => setStep(step + 1));
$('reset-steps').addEventListener('click', () => { selected = null; setStep(0); });
$('zoom-in').addEventListener('click', () => graph.zoomBy(1.2));
$('zoom-out').addEventListener('click', () => graph.zoomBy(1 / 1.2));
$('reset-view').addEventListener('click', () => graph.resetView());
$('play').addEventListener('click', () => {
  if (timer !== null) { stop(); return; }
  shell = null;
  if (step === data.peeling_steps.length) step = 0;
  const advance = () => {
    step += 1; selected = data.peeling_steps[step - 1].node;
    render();
    const active = $('steps').querySelector('.current');
    if (active) $('steps').scrollLeft = Math.max(0, active.offsetLeft - $('steps').offsetLeft - $('steps').clientWidth / 2);
    if (step === data.peeling_steps.length) stop();
  };
  timer = setInterval(advance, 1200);
  $('play').querySelector('span').textContent = '暂停';
  $('play').querySelector('path').setAttribute('d', 'M8 5v14M16 5v14');
  advance();
});
document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
window.addEventListener('pagehide', () => { stop(); if (graph) graph.destroy(); if (downloadUrl) URL.revokeObjectURL(downloadUrl); });
load();
