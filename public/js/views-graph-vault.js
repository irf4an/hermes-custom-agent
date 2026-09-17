    // ================= OBSIDIAN & MEMORY GRAPH VIEW JS =================
    let graphData = null;
    let graphNodes = [];
    let graphLinks = [];
    let graphNodeMap = new Map();
    let graphAnimId = null;
    let graphAlpha = 1.0;

    let graphZoomLevel = 1.0;
    let graphPanX = 0;
    let graphPanY = 0;
    let graphDraggingNode = null;
    let graphHoveredNode = null;
    let graphSelectedNode = null;
    let graphIsPanning = false;
    let graphPanStart = { x: 0, y: 0 };
    let graphMouseStart = { x: 0, y: 0 };
    let graphShowLabels = true;
    let graphFilter = 'all';
    let graphSearchQuery = '';

    async function loadObsidianGraphView(forceReload = false) {
      try {
        if (!graphData || forceReload) {
          graphData = await api('/api/graph', {}, 'Gagal mengambil data graph');
        }

        if (graphData && graphData.stats) {
          const nEl = document.getElementById('graph-stat-nodes');
          const lEl = document.getElementById('graph-stat-links');
          const legEl = document.getElementById('graph-legend-nodes');
          if (nEl) nEl.textContent = graphData.stats.totalNodes || 0;
          if (lEl) lEl.textContent = graphData.stats.totalLinks || 0;
          if (legEl) legEl.textContent = `${graphData.stats.totalNodes || 0} Nodes`;
        }

        initGraphCanvas();
        setupGraphSimulationData();
        startGraphSimulation();
        lucide.createIcons();
      } catch (err) {
        console.error('Error loadObsidianGraphView:', err);
      }
    }

    function setupGraphSimulationData() {
      if (!graphData || !graphData.nodes) return;
      const canvas = document.getElementById('obsidian-graph-canvas');
      const dpr = window.devicePixelRatio || 1;
      const w = canvas ? (canvas.width / dpr) || 800 : 800;
      const h = canvas ? (canvas.height / dpr) || 560 : 560;

      // Natural cluster anchors like Obsidian Graph
      const clusterCenters = {
        'hub:vault': { x: -260, y: -120 },
        'hub:daily': { x: 260, y: -120 },
        'hub:branding': { x: 260, y: 160 },
        'hub:memory': { x: -140, y: 180 },
        'note': { x: -260, y: -120 },
        'daily': { x: 260, y: -120 },
        'branding': { x: 260, y: 160 },
        'memory': { x: -140, y: 180 },
        'user_profile': { x: -300, y: 240 }
      };

      graphNodes = graphData.nodes.map(n => {
        const existing = graphNodeMap.get(n.id);
        const center = clusterCenters[n.id] || clusterCenters[n.group] || { x: 0, y: 0 };
        const angle = Math.random() * Math.PI * 2;
        const spread = n.group === 'hub' ? 14 : (50 + Math.random() * 95);
        return {
          ...n,
          x: existing ? existing.x : (center.x + Math.cos(angle) * spread),
          y: existing ? existing.y : (center.y + Math.sin(angle) * spread),
          vx: 0,
          vy: 0,
          radius: n.group === 'hub' ? 16 : (n.val ? Math.max(6.5, Math.min(13, n.val)) : 8)
        };
      });

      graphNodeMap = new Map();
      graphNodes.forEach(n => graphNodeMap.set(n.id, n));

      graphLinks = graphData.links.map(l => ({
        source: graphNodeMap.get(l.source) || l.source,
        target: graphNodeMap.get(l.target) || l.target,
        type: l.type
      })).filter(l => typeof l.source === 'object' && typeof l.target === 'object');

      graphAlpha = 1.0;
      graphPanX = w / 2;
      graphPanY = h / 2;
    }

    function resizeGraphCanvas() {
      const canvas = document.getElementById('obsidian-graph-canvas');
      if (!canvas) return;
      const parent = canvas.parentElement;
      if (!parent) return;
      const rect = parent.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const cssW = Math.floor(rect.width) || 800;
      const cssH = Math.floor(rect.height) || 600;
      if (canvas.width !== cssW * dpr || canvas.height !== cssH * dpr) {
        canvas.width = cssW * dpr;
        canvas.height = cssH * dpr;
      }
      if (!graphPanX && !graphPanY) {
        graphPanX = cssW / 2;
        graphPanY = cssH / 2;
      }
      renderGraph();
    }

    function initGraphCanvas() {
      const canvas = document.getElementById('obsidian-graph-canvas');
      if (!canvas) return;

      resizeGraphCanvas();

      if (!canvas._hasResizeObserver && window.ResizeObserver) {
        const ro = new ResizeObserver(() => {
          resizeGraphCanvas();
        });
        ro.observe(canvas.parentElement);
        canvas._hasResizeObserver = true;
      }

      if (canvas._hasGraphEvents) return;

      window.addEventListener('resize', resizeGraphCanvas);

      function getCanvasPos(e) {
        const rect = canvas.getBoundingClientRect();
        return {
          x: e.clientX - rect.left,
          y: e.clientY - rect.top
        };
      }

      function toWorldPos(screenX, screenY) {
        return {
          x: (screenX - graphPanX) / graphZoomLevel,
          y: (screenY - graphPanY) / graphZoomLevel
        };
      }

      function findNodeAt(worldX, worldY) {
        for (let i = graphNodes.length - 1; i >= 0; i--) {
          const n = graphNodes[i];
          if (isNodeFilteredOut(n)) continue;
          const dx = worldX - n.x;
          const dy = worldY - n.y;
          const hitRadius = n.radius + 6 / graphZoomLevel;
          if (dx * dx + dy * dy <= hitRadius * hitRadius) {
            return n;
          }
        }
        return null;
      }

      canvas.addEventListener('mousedown', (e) => {
        const pos = getCanvasPos(e);
        const world = toWorldPos(pos.x, pos.y);
        const hit = findNodeAt(world.x, world.y);

        graphMouseStart = { x: pos.x, y: pos.y };

        if (hit) {
          graphDraggingNode = hit;
          graphDraggingNode.isDragging = true;
          canvas.classList.remove('cursor-grab');
          canvas.classList.add('cursor-grabbing');
          graphAlpha = 0.5;
        } else {
          graphIsPanning = true;
          graphPanStart = { x: graphPanX, y: graphPanY };
          canvas.classList.remove('cursor-grab');
          canvas.classList.add('cursor-grabbing');
        }
      });

      window.addEventListener('mousemove', (e) => {
        if (!canvas.offsetParent) return;
        const pos = getCanvasPos(e);
        const world = toWorldPos(pos.x, pos.y);

        if (graphDraggingNode) {
          graphDraggingNode.x = world.x;
          graphDraggingNode.y = world.y;
          graphDraggingNode.vx = 0;
          graphDraggingNode.vy = 0;
          graphAlpha = 0.4;
          renderGraph();
          return;
        }

        if (graphIsPanning) {
          graphPanX = graphPanStart.x + (pos.x - graphMouseStart.x);
          graphPanY = graphPanStart.y + (pos.y - graphMouseStart.y);
          renderGraph();
          return;
        }

        const hit = findNodeAt(world.x, world.y);
        if (hit !== graphHoveredNode) {
          graphHoveredNode = hit;
          canvas.style.cursor = hit ? 'pointer' : 'grab';
          renderGraph();
        }
      });

      window.addEventListener('mouseup', (e) => {
        if (!canvas.offsetParent) return;
        const pos = getCanvasPos(e);
        const distMoved = Math.hypot(pos.x - graphMouseStart.x, pos.y - graphMouseStart.y);

        if (graphDraggingNode) {
          if (distMoved < 6) {
            if (graphSelectedNode && graphSelectedNode.id === graphDraggingNode.id) {
              closeGraphInspector();
            } else {
              selectGraphNode(graphDraggingNode);
            }
          }
          graphDraggingNode.isDragging = false;
          graphDraggingNode = null;
        } else if (graphIsPanning) {
          if (distMoved < 6 && graphSelectedNode) {
            closeGraphInspector();
          }
          graphIsPanning = false;
        }

        canvas.classList.remove('cursor-grabbing');
        canvas.classList.add('cursor-grab');
        renderGraph();
      });

      canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        const pos = getCanvasPos(e);
        const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
        const newZoom = Math.max(0.2, Math.min(3.5, graphZoomLevel * zoomFactor));

        graphPanX = pos.x - (pos.x - graphPanX) * (newZoom / graphZoomLevel);
        graphPanY = pos.y - (pos.y - graphPanY) * (newZoom / graphZoomLevel);
        graphZoomLevel = newZoom;
        renderGraph();
      }, { passive: false });

      canvas._hasGraphEvents = true;
    }

    function isNodeFilteredOut(node) {
      if (graphFilter !== 'all') {
        if (graphFilter === 'note' && node.group !== 'note' && node.group !== 'branding') return true;
        if (graphFilter === 'daily' && node.group !== 'daily') return true;
        if (graphFilter === 'memory' && node.group !== 'memory' && node.group !== 'user_profile') return true;
      }
      if (graphSearchQuery) {
        const q = graphSearchQuery.toLowerCase();
        const match = node.label.toLowerCase().includes(q) || (node.category && node.category.toLowerCase().includes(q));
        if (!match) return true;
      }
      return false;
    }

    function startGraphSimulation() {
      if (graphAnimId) cancelAnimationFrame(graphAnimId);

      const simulateStep = () => {
        if (graphAlpha > 0.005) {
          stepPhysics();
          graphAlpha *= 0.985;
        }
        renderGraph();
        graphAnimId = requestAnimationFrame(simulateStep);
      };

      graphAnimId = requestAnimationFrame(simulateStep);
    }

    function stepPhysics() {
      const kRepulsion = 3600 * graphAlpha;
      const kSpring = 0.035;
      const kCenter = 0.0035 * graphAlpha;

      for (let i = 0; i < graphNodes.length; i++) {
        const n1 = graphNodes[i];
        for (let j = i + 1; j < graphNodes.length; j++) {
          const n2 = graphNodes[j];
          const dx = n2.x - n1.x;
          const dy = n2.y - n1.y;
          const distSq = dx * dx + dy * dy + 200;
          const dist = Math.sqrt(distSq);
          const force = kRepulsion / distSq;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;

          if (!n1.isDragging) { n1.vx -= fx; n1.vy -= fy; }
          if (!n2.isDragging) { n2.vx += fx; n2.vy += fy; }
        }
      }

      for (let i = 0; i < graphLinks.length; i++) {
        const l = graphLinks[i];
        const s = l.source;
        const t = l.target;
        const isHubLink = s.group === 'hub' || t.group === 'hub';
        const targetDist = isHubLink ? 180 : 120;
        const dx = t.x - s.x;
        const dy = t.y - s.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const delta = dist - targetDist;
        const force = delta * kSpring;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;

        if (!s.isDragging) { s.vx += fx; s.vy += fy; }
        if (!t.isDragging) { t.vx -= fx; t.vy -= fy; }
      }

      for (let i = 0; i < graphNodes.length; i++) {
        const n = graphNodes[i];
        if (n.isDragging) continue;

        n.vx -= n.x * kCenter;
        n.vy -= n.y * kCenter;

        n.vx *= 0.85;
        n.vy *= 0.85;

        n.x += Math.max(-18, Math.min(18, n.vx));
        n.y += Math.max(-18, Math.min(18, n.vy));
      }
    }

    function renderGraph() {
      const canvas = document.getElementById('obsidian-graph-canvas');
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;

      ctx.save();
      ctx.scale(dpr, dpr);

      // Canvas Background (Light Mode System Theme)
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, 0, w, h);

      // Subtle dot grid
      ctx.save();
      ctx.fillStyle = '#e2e8f0';
      const gridSize = 28 * graphZoomLevel;
      const startX = (graphPanX % gridSize);
      const startY = (graphPanY % gridSize);
      for (let gx = startX - gridSize; gx < w + gridSize; gx += gridSize) {
        for (let gy = startY - gridSize; gy < h + gridSize; gy += gridSize) {
          ctx.beginPath();
          ctx.arc(gx, gy, 1.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();

      ctx.translate(graphPanX, graphPanY);
      ctx.scale(graphZoomLevel, graphZoomLevel);

      const activeFocusNode = graphSelectedNode || graphHoveredNode;
      const connectedNodeIds = new Set();
      if (activeFocusNode) {
        connectedNodeIds.add(activeFocusNode.id);
        graphLinks.forEach(l => {
          if (l.source.id === activeFocusNode.id) connectedNodeIds.add(l.target.id);
          if (l.target.id === activeFocusNode.id) connectedNodeIds.add(l.source.id);
        });
      }

      // Draw Links (Clean high contrast lines)
      for (let i = 0; i < graphLinks.length; i++) {
        const l = graphLinks[i];
        const s = l.source;
        const t = l.target;

        const isSFiltered = isNodeFilteredOut(s);
        const isTFiltered = isNodeFilteredOut(t);
        if (isSFiltered || isTFiltered) continue;

        const isHighlighted = activeFocusNode && (s.id === activeFocusNode.id || t.id === activeFocusNode.id);
        const isDimmed = activeFocusNode && !isHighlighted;

        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(t.x, t.y);

        if (isHighlighted) {
          ctx.strokeStyle = '#2563eb'; // Vibrant high-contrast blue for active link
          ctx.lineWidth = 2.8 / graphZoomLevel;
          ctx.globalAlpha = 1.0;
        } else if (isDimmed) {
          ctx.strokeStyle = '#cbd5e1';
          ctx.lineWidth = 1.0 / graphZoomLevel;
          ctx.globalAlpha = 0.40;
        } else {
          ctx.strokeStyle = '#94a3b8'; // Solid slate-400
          ctx.lineWidth = 1.4 / graphZoomLevel;
          ctx.globalAlpha = 0.70;
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1.0;

      // Draw Nodes
      for (let i = 0; i < graphNodes.length; i++) {
        const n = graphNodes[i];
        const isFiltered = isNodeFilteredOut(n);
        const isFocus = activeFocusNode && (n.id === activeFocusNode.id);
        const isConnected = activeFocusNode && connectedNodeIds.has(n.id);
        const isDimmed = activeFocusNode && !isConnected;

        ctx.save();
        if (isFiltered) {
          ctx.globalAlpha = 0.12;
        } else if (isDimmed) {
          ctx.globalAlpha = 0.38;
        } else {
          ctx.globalAlpha = 1.0;
        }

        const r = n.radius;

        // Glowing halo for selected/focused node
        if (isFocus) {
          ctx.beginPath();
          ctx.arc(n.x, n.y, r + 7 / graphZoomLevel, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(37, 99, 235, 0.18)';
          ctx.fill();
          ctx.lineWidth = 2.5 / graphZoomLevel;
          ctx.strokeStyle = '#2563eb';
          ctx.stroke();
        } else if (n === graphHoveredNode && !graphSelectedNode) {
          ctx.beginPath();
          ctx.arc(n.x, n.y, r + 5 / graphZoomLevel, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(148, 163, 184, 0.2)';
          ctx.fill();
        }

        // Node circle
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        ctx.fillStyle = n.color || '#3b82f6';
        ctx.fill();

        // Node border
        ctx.lineWidth = 2 / graphZoomLevel;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();

        if (n.group === 'hub') {
          ctx.lineWidth = 1 / graphZoomLevel;
          ctx.strokeStyle = 'rgba(15, 23, 42, 0.25)';
          ctx.stroke();
        }

        // Labels: Obsidian clean style
        if (!isFiltered) {
          const isHub = n.group === 'hub';
          const isHover = (n === graphHoveredNode);
          const hasPill = isFocus || isHub || isHover || (activeFocusNode && isConnected);

          let shouldShowText = false;
          if (activeFocusNode) {
            shouldShowText = isFocus || isConnected;
          } else if (graphShowLabels) {
            shouldShowText = isHub || isHover || (n.degree && n.degree >= 3) || graphZoomLevel >= 1.25;
          } else {
            shouldShowText = isHub || isHover;
          }

          if (shouldShowText) {
            const fontSize = Math.max(9.5, Math.min(12.5, (isHub ? 11.5 : 10.5) / Math.sqrt(graphZoomLevel)));
            ctx.font = `600 ${fontSize}px Inter, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            let labelText = n.label;
            if (!isHub && !isFocus && labelText.length > 22) {
              labelText = labelText.slice(0, 20) + '…';
            }

            const labelY = n.y + r + (8 / graphZoomLevel);

            ctx.save();
            if (hasPill) {
              const textMetrics = ctx.measureText(labelText);
              const textW = textMetrics.width;
              const padX = 5 / graphZoomLevel;
              const padY = 2.5 / graphZoomLevel;

              ctx.fillStyle = isFocus ? '#0f172a' : (isHub ? '#1e293b' : 'rgba(255, 255, 255, 0.96)');
              ctx.strokeStyle = isFocus ? '#0f172a' : (isHub ? '#1e293b' : (isConnected ? '#94a3b8' : '#cbd5e1'));
              ctx.lineWidth = (isFocus || isConnected) ? (1.5 / graphZoomLevel) : (1 / graphZoomLevel);
              ctx.beginPath();
              if (ctx.roundRect) {
                ctx.roundRect(n.x - textW / 2 - padX, labelY - fontSize / 2 - padY, textW + padX * 2, fontSize + padY * 2, 3 / graphZoomLevel);
              } else {
                ctx.rect(n.x - textW / 2 - padX, labelY - fontSize / 2 - padY, textW + padX * 2, fontSize + padY * 2);
              }
              ctx.fill();
              ctx.stroke();

              ctx.fillStyle = (isFocus || isHub) ? '#ffffff' : (isConnected ? '#0f172a' : '#1e293b');
              ctx.fillText(labelText, n.x, labelY);
            } else {
              // Lightweight Obsidian style text with white halo for non-hub nodes
              ctx.lineWidth = 3 / graphZoomLevel;
              ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
              ctx.strokeText(labelText, n.x, labelY);
              ctx.fillStyle = '#334155';
              ctx.fillText(labelText, n.x, labelY);
            }
            ctx.restore();
          }
        }
        ctx.restore();
      }

      ctx.restore();
    }

    function handleGraphSearch(val) {
      graphSearchQuery = (val || '').trim();
      renderGraph();
    }

    function setGraphFilter(filter, el) {
      graphFilter = filter;
      document.querySelectorAll('.graph-filter-btn').forEach(btn => {
        btn.classList.remove('bg-white', 'text-slate-900', 'shadow-2xs', 'font-semibold');
        btn.classList.add('text-slate-600');
      });
      if (el) {
        el.classList.remove('text-slate-600');
        el.classList.add('bg-white', 'text-slate-900', 'shadow-2xs', 'font-semibold');
      }
      renderGraph();
    }

    function graphZoom(factor) {
      const canvas = document.getElementById('obsidian-graph-canvas');
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      const cx = (canvas.width / dpr) / 2;
      const cy = (canvas.height / dpr) / 2;
      const newZoom = Math.max(0.2, Math.min(3.5, graphZoomLevel * factor));
      graphPanX = cx - (cx - graphPanX) * (newZoom / graphZoomLevel);
      graphPanY = cy - (cy - graphPanY) * (newZoom / graphZoomLevel);
      graphZoomLevel = newZoom;
      renderGraph();
    }

    function graphResetView() {
      const canvas = document.getElementById('obsidian-graph-canvas');
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      graphZoomLevel = 1.0;
      graphPanX = (canvas.width / dpr) / 2;
      graphPanY = (canvas.height / dpr) / 2;
      graphAlpha = 0.8;
      renderGraph();
    }

    function graphToggleLabels() {
      graphShowLabels = !graphShowLabels;
      const btn = document.getElementById('btn-toggle-labels');
      if (btn) {
        btn.textContent = graphShowLabels ? 'Labels On' : 'Labels Off';
        btn.className = graphShowLabels
          ? 'px-2 py-1 bg-blue-50 border border-blue-200 rounded-lg text-[11px] font-semibold text-blue-700 transition'
          : 'px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-[11px] font-medium text-slate-500 transition';
      }
      renderGraph();
    }

    async function selectGraphNode(node) {
      graphSelectedNode = node;
      const inspector = document.getElementById('graph-node-inspector');
      if (!inspector) return;
      inspector.classList.remove('hidden');
      resizeGraphCanvas();

      const canvas = document.getElementById('obsidian-graph-canvas');
      if (canvas) {
        const dpr = window.devicePixelRatio || 1;
        const visibleW = canvas.width / dpr;
        const screenX = node.x * graphZoomLevel + graphPanX;
        if (screenX > visibleW - 60 || screenX < 60) {
          graphPanX = (visibleW / 2) - (node.x * graphZoomLevel);
        }
      }

      document.getElementById('inspector-title').textContent = node.label;
      document.getElementById('inspector-degree').textContent = `${node.degree || 0} links`;
      const badge = document.getElementById('inspector-badge');
      if (badge) {
        badge.textContent = (node.category || node.group).toUpperCase();
        badge.style.backgroundColor = node.color ? node.color + '20' : '#e0f2fe';
        badge.style.color = node.color || '#0369a1';
        badge.style.borderColor = node.color ? node.color + '40' : '#bae6fd';
      }

      const pathBox = document.getElementById('inspector-path-box');
      if (pathBox) {
        pathBox.textContent = node.path ? node.path.replace('/root/', '~/') : (node.description || node.id);
      }

      // Check if node is a deletable vault note
      const isVaultNote = node.path && node.path.includes('/notes/') && !node.id.startsWith('hub:');
      const btnDel = document.getElementById('btn-delete-node');
      const footerDel = document.getElementById('inspector-delete-footer');
      if (btnDel) {
        if (isVaultNote) btnDel.classList.remove('hidden');
        else btnDel.classList.add('hidden');
      }
      if (footerDel) {
        if (isVaultNote) footerDel.classList.remove('hidden');
        else footerDel.classList.add('hidden');
      }
      if (window.lucide) lucide.createIcons();

      const contentBox = document.getElementById('inspector-content');
      if (contentBox) contentBox.textContent = 'Loading details...';

      try {
        const { ok: gNodeOk, data } = await apiFull(`/api/graph/node?id=${encodeURIComponent(node.id)}`);
        if (gNodeOk) {
          if (contentBox) {
            contentBox.textContent = data.content || data.node?.excerpt || node.description || node.excerpt || '(No content text)';
          }

          const linksList = document.getElementById('inspector-links-list');
          const countEl = document.getElementById('inspector-links-count');
          if (countEl) countEl.textContent = (data.connectedNodes || []).length;
          if (linksList) {
            if (!data.connectedNodes || data.connectedNodes.length === 0) {
              linksList.innerHTML = '<span class="text-slate-400 italic">No connected nodes</span>';
            } else {
              linksList.innerHTML = data.connectedNodes.map(c => `
                <button type="button" onclick="focusGraphNode('${c.id}')" class="px-2 py-0.5 rounded text-[10px] font-medium border border-slate-200 bg-slate-50 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 transition cursor-pointer text-slate-700 flex items-center gap-1">
                  <span class="w-1.5 h-1.5 rounded-full" style="background-color: ${c.color || '#3b82f6'}"></span>
                  <span>${c.label}</span>
                </button>
              `).join('');
            }
          }
        }
      } catch (err) {
        if (contentBox) contentBox.textContent = node.description || node.excerpt || 'Gagal memuat detail node';
      }

      renderGraph();
    }

    function focusGraphNode(nodeId) {
      const n = graphNodeMap.get(nodeId);
      if (!n) return;
      selectGraphNode(n);
      const canvas = document.getElementById('obsidian-graph-canvas');
      if (canvas) {
        const dpr = window.devicePixelRatio || 1;
        graphPanX = (canvas.width / dpr) / 2 - n.x * graphZoomLevel;
        graphPanY = (canvas.height / dpr) / 2 - n.y * graphZoomLevel;
        renderGraph();
      }
    }

    function closeGraphInspector() {
      const inspector = document.getElementById('graph-node-inspector');
      if (inspector) inspector.classList.add('hidden');
      graphSelectedNode = null;
      resizeGraphCanvas();
      renderGraph();
    }

    function copyInspectorContent() {
      const text = document.getElementById('inspector-content')?.innerText || '';
      if (text && navigator.clipboard) {
        navigator.clipboard.writeText(text).then(() => {
          const btn = document.getElementById('btn-copy-inspector');
          if (btn) {
            btn.textContent = 'Copied!';
            setTimeout(() => { btn.textContent = 'Copy Text'; }, 1500);
          }
        });
      }
    }


    async function deleteCurrentGraphNode() {
      if (!graphSelectedNode) return;
      const node = graphSelectedNode;
      const isVaultNote = node.path && node.path.includes('/notes/') && !node.id.startsWith('hub:');
      if (!isVaultNote) {
        alert('Hanya catatan file Obsidian yang dapat dihapus.');
        return;
      }

      let relPath = node.path.replace(/^\/root\/notes\//, '').replace(/^\/+/, '');
      if (!confirm(`Hapus catatan "${node.label}" (${relPath}) secara permanen dari Obsidian Vault?`)) {
        return;
      }

      try {
        const { data } = await apiFull('/api/vault/file', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: relPath })
        });
        if (data.success) {
          closeGraphInspector();
          await loadObsidianGraphView(true);
          const modal = document.getElementById('vault-notes-modal');
          if (modal && !modal.classList.contains('hidden')) {
            loadVaultNotesList();
          }
          alert(data.message || `Catatan "${node.label}" berhasil dihapus.`);
        } else {
          alert('Gagal menghapus catatan: ' + (data.error || 'Unknown error'));
        }
      } catch (err) {
        alert('Gagal menghubungi server: ' + err.message);
      }
    }

    let rawVaultFiles = [];

    function openVaultNotesModal() {
      const modal = document.getElementById('vault-notes-modal');
      if (!modal) return;
      modal.classList.remove('hidden');
      loadVaultNotesList();
      if (window.lucide) lucide.createIcons();
    }

    function closeVaultNotesModal() {
      const modal = document.getElementById('vault-notes-modal');
      if (modal) modal.classList.add('hidden');
    }

    async function loadVaultNotesList() {
      const body = document.getElementById('vault-notes-list-body');
      const countBadge = document.getElementById('vault-notes-count-badge');
      if (body) body.innerHTML = '<div class="p-6 text-center text-slate-400 font-mono">Loading vault notes...</div>';

      try {
        const { ok: vaultListOk, data } = await apiFull('/api/vault/files');
        if (vaultListOk) {
          rawVaultFiles = data.files || [];
          if (countBadge) countBadge.textContent = `${rawVaultFiles.length} notes`;
          const query = document.getElementById('vault-notes-search')?.value || '';
          filterVaultNotesList(query);
        } else {
          if (body) body.innerHTML = '<div class="p-6 text-center text-rose-500">Gagal memuat catatan.</div>';
        }
      } catch (err) {
        if (body) body.innerHTML = `<div class="p-6 text-center text-rose-500">Error: ${err.message}</div>`;
      }
    }

    function filterVaultNotesList(query = '') {
      const q = (query || '').toLowerCase().trim();
      const filtered = rawVaultFiles.filter(f => {
        if (!q) return true;
        const nameMatch = (f.name || '').toLowerCase().includes(q);
        const pathMatch = (f.path || '').toLowerCase().includes(q);
        const tagMatch = (f.tags || []).some(t => t.toLowerCase().includes(q));
        return nameMatch || pathMatch || tagMatch;
      });
      renderVaultNotesList(filtered);
    }

    function renderVaultNotesList(files) {
      const body = document.getElementById('vault-notes-list-body');
      if (!body) return;
      if (!files || files.length === 0) {
        body.innerHTML = '<div class="p-8 text-center text-slate-400"><i data-lucide="file-x" class="w-6 h-6 mx-auto mb-2 opacity-60"></i><div>Tidak ada catatan ditemukan.</div></div>';
        if (window.lucide) lucide.createIcons();
        return;
      }

      body.innerHTML = files.map(f => {
        const sizeKb = f.size ? (f.size / 1024).toFixed(1) + ' KB' : '';
        const mtime = f.mtime ? new Date(f.mtime).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
        const folder = f.path.includes('/') ? f.path.substring(0, f.path.lastIndexOf('/')) : 'root';
        const isDaily = f.path.startsWith('Daily Logs');
        const badgeColor = isDaily ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-blue-50 text-blue-700 border-blue-200';

        const escapedPath = f.path.replace(/'/g, "\\'");
        const escapedName = f.name.replace(/'/g, "\\'");

        return `
          <div class="py-2.5 px-3 hover:bg-slate-50/80 rounded-lg flex items-center justify-between gap-3 transition">
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2 mb-0.5">
                <span class="px-1.5 py-0.2 rounded text-[9.5px] font-bold uppercase border ${badgeColor}">${folder}</span>
                <h5 class="text-xs font-semibold text-slate-800 truncate">${f.name}</h5>
              </div>
              <div class="flex items-center gap-3 text-[10.5px] text-slate-400 font-mono">
                <span class="truncate">${f.path}</span>
                ${sizeKb ? `<span>• ${sizeKb}</span>` : ''}
                ${mtime ? `<span>• ${mtime}</span>` : ''}
              </div>
            </div>
            <div class="flex items-center gap-1.5 shrink-0">
              <button type="button" onclick="viewVaultNoteInGraph('${escapedPath}')" class="px-2 py-1 rounded bg-slate-100 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 border border-slate-200 text-[11px] font-medium text-slate-700 flex items-center gap-1 transition cursor-pointer" title="Lihat di Graph">
                <i data-lucide="crosshair" class="w-3.5 h-3.5"></i>
                <span>Graph</span>
              </button>
              <button type="button" onclick="deleteVaultNote('${escapedPath}', '${escapedName}')" class="p-1.5 rounded bg-rose-50 hover:bg-rose-100 text-rose-600 hover:text-rose-800 border border-rose-200 transition cursor-pointer" title="Hapus Catatan">
                <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
              </button>
            </div>
          </div>
        `;
      }).join('');

      if (window.lucide) lucide.createIcons();
    }

    async function deleteVaultNote(relPath, noteName) {
      if (!confirm(`Hapus catatan "${noteName}" (${relPath}) secara permanen dari Obsidian Vault?`)) {
        return;
      }

      try {
        const { data } = await apiFull('/api/vault/file', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: relPath })
        });
        if (data.success) {
          await loadVaultNotesList();
          loadObsidianGraphView(true);
          if (graphSelectedNode && graphSelectedNode.path && graphSelectedNode.path.includes(relPath)) {
            closeGraphInspector();
          }
          alert(data.message || `Catatan "${noteName}" berhasil dihapus.`);
        } else {
          alert('Gagal menghapus catatan: ' + (data.error || 'Unknown error'));
        }
      } catch (err) {
        alert('Gagal menghubungi server: ' + err.message);
      }
    }

    function viewVaultNoteInGraph(relPath) {
      closeVaultNotesModal();
      const targetNode = graphNodes.find(n => n.path && n.path.includes(relPath)) || graphNodes.find(n => n.id.includes(relPath.replace(/\.md$/, '')));
      if (targetNode) {
        focusGraphNode(targetNode.id);
      } else {
        alert('Node tidak ditemukan di graph saat ini.');
      }
    }

    renderAgents();
    fetchSchedules();
    setInterval(fetchSchedules, 10000);
    fetchLiveMetrics();
    document.getElementById('kanban-search')?.addEventListener('input', renderKanbanView);
    setInterval(fetchLiveMetrics, 30000);
