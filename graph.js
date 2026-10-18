/* 只负责 D3 布局与图形状态。核数和剥离顺序均由 Python 提供。 */
export class NetworkGraph {
  constructor(container, svg, data, onSelect, onZoom) {
    this.container = container;
    this.svg = d3.select(svg);
    this.nodes = data.nodes.map(node => ({ ...node }));
    this.links = data.links.map(link => ({ ...link }));
    this.svg.selectAll('*').remove();
    this.layer = this.svg.append('g');
    this.edges = this.layer.append('g').attr('aria-hidden', 'true').selectAll('line')
      .data(this.links).join('line').attr('class', 'network-link');
    this.vertices = this.layer.append('g').selectAll('g').data(this.nodes).join('g')
      .attr('class', 'network-node').attr('tabindex', 0).attr('role', 'button')
      .attr('data-node-id', node => node.id)
      .on('click', (event, node) => { event.stopPropagation(); onSelect(node.id); })
      .on('keydown', (event, node) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault(); onSelect(node.id);
        }
      });
    this.vertices.append('circle').attr('class', 'node-ring').attr('r', 28);
    this.vertices.append('circle').attr('class', 'node-body').attr('r', 22);
    this.vertices.append('text').text(node => node.id);
    this.vertices.append('title').text(node => `节点 ${node.id} · 原图度数 ${node.degree} · 核数 ${node.core_number}`);
    this.zoom = d3.zoom().scaleExtent([0.5, 2.5])
      .filter(event => !event.target.closest('.network-node') && (!event.ctrlKey || event.type === 'wheel') && !event.button)
      .on('zoom', event => { this.layer.attr('transform', event.transform); onZoom(event.transform.k); });
    this.svg.call(this.zoom).on('dblclick.zoom', null);
    this.simulation = d3.forceSimulation(this.nodes)
      .force('link', d3.forceLink(this.links).id(node => node.id).distance(107).strength(0.6))
      .force('charge', d3.forceManyBody().strength(-520))
      .force('collision', d3.forceCollide(37))
      .on('tick', () => this.tick());
    this.vertices.call(d3.drag().container(() => this.layer.node())
      .on('start', (event, node) => {
        if (!event.active) this.simulation.alphaTarget(0.15).restart();
        node.fx = node.x; node.fy = node.y;
      })
      .on('drag', (event, node) => {
        node.fx = Math.max(35, Math.min(this.width - 35, event.x));
        node.fy = Math.max(55, Math.min(this.height - 55, event.y));
      })
      .on('end', (event, node) => {
        if (!event.active) this.simulation.alphaTarget(0);
        node.fx = null; node.fy = null;
      }));
    this.resize();
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(container);
  }

  resize() {
    const { width, height } = this.container.getBoundingClientRect();
    if (!width || !height || (this.width === width && this.height === height)) return;
    const widthChanged = this.width !== width;
    this.width = width; this.height = height;
    this.svg.attr('viewBox', `0 0 ${width} ${height}`);
    // 侧栏内容改变高度时保留节点位置，避免选择节点导致整图重排。
    if (!widthChanged) { this.tick(); return; }
    this.simulation.force('center', d3.forceCenter(width / 2, height / 2))
      .force('x', d3.forceX(width / 2).strength(0.035))
      .force('y', d3.forceY(height / 2).strength(0.035));
    this.simulation.alpha(0.8).stop().tick(220);
    this.tick();
    this.resetView();
  }

  tick() {
    if (!this.width) return;
    for (const node of this.nodes) {
      node.x = Math.max(35, Math.min(this.width - 35, node.x));
      node.y = Math.max(58, Math.min(this.height - 60, node.y));
    }
    this.edges.attr('x1', link => link.source.x).attr('y1', link => link.source.y)
      .attr('x2', link => link.target.x).attr('y2', link => link.target.y);
    this.vertices.attr('transform', node => `translate(${node.x},${node.y})`);
  }

  update({ shell, selected, removed }) {
    this.vertices.classed('highlighted', node => shell !== null && node.core_number === shell)
      .classed('selected', node => node.id === selected)
      .classed('removed', node => removed.has(node.id))
      .attr('aria-pressed', node => String(node.id === selected))
      .attr('aria-label', node => `节点 ${node.id}，原图度数 ${node.degree}，核数 ${node.core_number}${removed.has(node.id) ? '，已剥离' : ''}`);
    this.edges.classed('connected', link => link.source.id === selected || link.target.id === selected)
      .classed('removed', link => removed.has(link.source.id) || removed.has(link.target.id));
  }

  zoomBy(factor) { this.svg.call(this.zoom.scaleBy, factor); }
  resetView() { this.svg.call(this.zoom.transform, d3.zoomIdentity); }
  destroy() { this.simulation.stop(); this.observer.disconnect(); this.svg.on('.zoom', null); }
}
