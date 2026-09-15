const fs = require('fs');
const path = require('path');

const VAULT_DIR = '/root/notes';
const MEMORY_DIR = '/root/.hermes/memories';
const PROFILES_DIR = '/root/.hermes/profiles';

function scanVault(dir, base = '') {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of list) {
    if (item.name.startsWith('.') || item.name === 'node_modules') continue;
    const full = path.join(dir, item.name);
    const rel = path.join(base, item.name);
    if (item.isDirectory()) {
      results = results.concat(scanVault(full, rel));
    } else if (item.name.endsWith('.md')) {
      results.push({ full, rel, name: item.name });
    }
  }
  return results;
}

function buildGraphData() {
  const nodes = [];
  const links = [];
  const linkSet = new Set();

  function addLink(source, target, type = 'rel') {
    if (!source || !target || source === target) return;
    const key = [source, target].sort().join(':::');
    if (!linkSet.has(key)) {
      linkSet.add(key);
      links.push({ source, target, type });
    }
  }

  // Core Hubs (Major clusters like Obsidian graph view)
  nodes.push({
    id: 'hub:vault',
    label: 'Obsidian Vault',
    group: 'hub',
    category: 'Hub',
    val: 16,
    color: '#2563eb', // Blue-600
    description: 'Central root of Obsidian knowledge vault (/root/notes)'
  });
  nodes.push({
    id: 'hub:memory',
    label: 'Hermes Memory Core',
    group: 'hub',
    category: 'Hub',
    val: 16,
    color: '#d97706', // Amber-600
    description: 'Curated persistent agent memory & operator context'
  });
  nodes.push({
    id: 'hub:daily',
    label: 'Daily Logs',
    group: 'hub',
    category: 'Hub',
    val: 13,
    color: '#059669', // Emerald-600
    description: 'Automated daily activity logs & session records'
  });
  nodes.push({
    id: 'hub:branding',
    label: 'Personal Branding',
    group: 'hub',
    category: 'Hub',
    val: 13,
    color: '#7c3aed', // Purple-600
    description: 'Content strategies, briefs, and execution packs'
  });

  addLink('hub:vault', 'hub:daily', 'hierarchy');
  addLink('hub:vault', 'hub:branding', 'hierarchy');
  addLink('hub:vault', 'hub:memory', 'bridge');

  // 1. Vault Notes
  const files = scanVault(VAULT_DIR);
  const noteMap = new Map();

  files.forEach(f => {
    const baseName = f.name.replace(/\.md$/, '');
    const id = 'note:' + baseName;
    let content = '';
    let mtime = Date.now();
    let size = 0;
    try {
      const st = fs.statSync(f.full);
      mtime = st.mtimeMs;
      size = st.size;
      content = fs.readFileSync(f.full, 'utf8');
    } catch (e) {}

    let group = 'note';
    let hub = 'hub:vault';
    let color = '#3b82f6'; // Blue-500
    let category = 'Vault Note';

    if (f.rel.startsWith('Daily Logs')) {
      group = 'daily';
      hub = 'hub:daily';
      color = '#10b981'; // Emerald-500
      category = 'Daily Log';
    } else if (f.rel.startsWith('Personal Branding')) {
      group = 'branding';
      hub = 'hub:branding';
      color = '#8b5cf6'; // Violet-500
      category = 'Branding & Content';
    }

    const nodeObj = {
      id,
      label: baseName,
      group,
      category,
      color,
      val: 8,
      path: f.full,
      rel: f.rel,
      size,
      mtime,
      excerpt: content.slice(0, 200).replace(/[#*`>_]/g, '').trim(),
      rawContent: content
    };

    nodes.push(nodeObj);
    noteMap.set(baseName.toLowerCase(), id);
    addLink(hub, id, 'folder');
  });

  // Wikilinks inside notes
  nodes.forEach(src => {
    if (!src.rawContent) return;
    const wlMatches = [...src.rawContent.matchAll(/\[\[(.*?)\]\]/g)];
    wlMatches.forEach(m => {
      const raw = m[1].split('|')[0].trim().replace(/\.md$/, '').toLowerCase();
      const targetId = noteMap.get(raw);
      if (targetId) {
        addLink(src.id, targetId, 'wikilink');
      }
    });

    // Semantic connections
    if (src.group === 'daily') {
      if (src.rawContent.includes('Project State') || src.rawContent.includes('Mission Control')) {
        addLink(src.id, 'note:Project State - Mission Control & VPS Setup', 'mention');
      }
      if (src.rawContent.includes('VPS Configuration') || src.rawContent.includes('swapfile')) {
        addLink(src.id, 'note:VPS Configuration', 'mention');
      }
    }
    if (src.group === 'branding') {
      if (src.rawContent.includes('Habits Tracker Journey') && src.id !== 'note:Brief - Habits Tracker Journey') {
        addLink(src.id, 'note:Brief - Habits Tracker Journey', 'mention');
      }
    }
  });

  // 2. Hermes Memories (Live memory parsed from disk)
  function parseMemoryFile(filePath, prefix, parentHub, labelPrefix, color, category) {
    if (!fs.existsSync(filePath)) return;
    let raw = '';
    try {
      raw = fs.readFileSync(filePath, 'utf8');
    } catch (e) { return; }

    const sections = raw.split(/§/).map(s => s.trim()).filter(Boolean);
    sections.forEach((text, idx) => {
      const firstLine = text.split('\n')[0].replace(/^#+\s*/, '').trim();
      const title = firstLine.length > 32 ? firstLine.slice(0, 29) + '...' : firstLine;
      const memId = `${prefix}:${idx + 1}`;

      nodes.push({
        id: memId,
        label: title || `${labelPrefix} #${idx + 1}`,
        group: prefix.includes('user') ? 'user_profile' : 'memory',
        category,
        color,
        val: 6,
        excerpt: text.slice(0, 200).replace(/[#*`>_]/g, '').trim(),
        rawContent: text
      });

      addLink(parentHub, memId, 'memory_link');

      // Cross links to notes
      const lower = text.toLowerCase();
      if (lower.includes('obsidian') || lower.includes('vault') || lower.includes('notes')) {
        addLink(memId, 'note:Project State - Mission Control & VPS Setup', 'memory_rel');
      }
      if (lower.includes('swapfile') || lower.includes('swappiness') || lower.includes('vps:')) {
        addLink(memId, 'note:VPS Configuration', 'memory_rel');
      }
      if (lower.includes('dashboard') || lower.includes('mission-control') || lower.includes('9router')) {
        addLink(memId, 'note:Project State - Mission Control & VPS Setup', 'memory_rel');
      }
    });
  }

  parseMemoryFile(path.join(MEMORY_DIR, 'MEMORY.md'), 'mem_zeta', 'hub:memory', 'Zeta Memory', '#f59e0b', 'Agent Notes');
  parseMemoryFile(path.join(MEMORY_DIR, 'USER.md'), 'mem_user', 'hub:memory', 'User Profile', '#ef4444', 'User Profile');

  // Atlas memory if available
  const atlasMem = path.join(PROFILES_DIR, 'atlas', 'memories', 'MEMORY.md');
  if (fs.existsSync(atlasMem)) {
    parseMemoryFile(atlasMem, 'mem_atlas', 'hub:memory', 'Atlas Memory', '#ea580c', 'Team Orchestrator Memory');
  }

  // Calculate degrees for node importance
  const degrees = {};
  links.forEach(l => {
    degrees[l.source] = (degrees[l.source] || 0) + 1;
    degrees[l.target] = (degrees[l.target] || 0) + 1;
  });

  nodes.forEach(n => {
    n.degree = degrees[n.id] || 0;
    if (n.group !== 'hub') {
      n.val = Math.min(14, Math.max(5, 5 + Math.floor(n.degree * 1.2)));
    }
  });

  // Strip rawContent from lightweight graph list (client can fetch detail or use excerpt)
  const clientNodes = nodes.map(n => {
    const { rawContent, ...rest } = n;
    return rest;
  });

  return {
    success: true,
    stats: {
      totalNodes: nodes.length,
      totalLinks: links.length,
      vaultNotes: files.length,
      memoriesCount: nodes.filter(n => n.group === 'memory' || n.group === 'user_profile').length
    },
    nodes: clientNodes,
    links
  };
}

function getNodeDetail(nodeId) {
  const data = buildGraphData();
  const n = data.nodes.find(x => x.id === nodeId);
  if (!n) return null;

  let fullContent = '';
  if (n.path && fs.existsSync(n.path)) {
    fullContent = fs.readFileSync(n.path, 'utf8');
  } else if (n.excerpt) {
    // For memories, read source file and find exact section
    if (n.id.startsWith('mem_zeta:')) {
      const idx = parseInt(n.id.split(':')[1], 10) - 1;
      const raw = fs.readFileSync(path.join(MEMORY_DIR, 'MEMORY.md'), 'utf8');
      const parts = raw.split(/§/).map(s => s.trim()).filter(Boolean);
      fullContent = parts[idx] || n.excerpt;
    } else if (n.id.startsWith('mem_user:')) {
      const idx = parseInt(n.id.split(':')[1], 10) - 1;
      const raw = fs.readFileSync(path.join(MEMORY_DIR, 'USER.md'), 'utf8');
      const parts = raw.split(/§/).map(s => s.trim()).filter(Boolean);
      fullContent = parts[idx] || n.excerpt;
    } else if (n.id.startsWith('mem_atlas:')) {
      const idx = parseInt(n.id.split(':')[1], 10) - 1;
      const raw = fs.readFileSync(path.join(PROFILES_DIR, 'atlas', 'memories', 'MEMORY.md'), 'utf8');
      const parts = raw.split(/§/).map(s => s.trim()).filter(Boolean);
      fullContent = parts[idx] || n.excerpt;
    } else {
      fullContent = n.excerpt;
    }
  }

  const connectedLinks = data.links.filter(l => l.source === nodeId || l.target === nodeId);
  const connectedNodeIds = connectedLinks.map(l => (l.source === nodeId ? l.target : l.source));
  const connectedNodes = data.nodes.filter(x => connectedNodeIds.includes(x.id));

  return {
    node: n,
    content: fullContent,
    connectedNodes
  };
}

module.exports = {
  buildGraphData,
  getNodeDetail
};
