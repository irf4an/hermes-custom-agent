    lucide.createIcons();

    // Placeholder until live profiles arrive via fetchLiveMetrics
    const agentsData = [
      { name: 'default', label: 'Local Hermes', tag: 'default', online: true },
    ];

    let globalSessionsData = null;

    // Deployment-specific paths are supplied by the backend (HERMES_HOME, AGENT_WORKSPACE_DIR,
    // /api/drive/deliverables -> rootFolder). The constants below are pre-fetch placeholders only.
    let driveRootFolder = '~/workspace';
    const shortHermes = (p) => String(p || '').replace(/^\S*?\/\.hermes/, '~');
    const agentFolder = (id) => `${driveRootFolder.replace(/\/$/, '')}/${id}/`;


    // Neutral display metadata derived from the agent id + live profile data.
    // No hardcoded team names: cloners see their own agents here.
    const capAgentId = (id) => id === 'default' ? 'Default' : String(id).charAt(0).toUpperCase() + String(id).slice(1);
    const profileNameFor = (id) => (globalProfiles.find(p => p.id === id)?.name) || capAgentId(id);
    const hashPick = (id, arr) => { let h = 0; for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return arr[h % arr.length]; };
    const META_ICONS = ['user-check', 'compass', 'binary', 'pen-tool', 'palette', 'radar'];
    const META_COLORS = ['indigo', 'blue', 'emerald', 'amber', 'purple', 'rose'];
    const agentMetaFor = (id) => ({ name: profileNameFor(id), role: 'Agent', icon: hashPick(id, META_ICONS), color: hashPick(id, META_COLORS) });
    const CHAT_BADGES = ['bg-amber-50 text-amber-700 border-amber-200', 'bg-indigo-50 text-indigo-700 border-indigo-200', 'bg-emerald-50 text-emerald-700 border-emerald-200', 'bg-purple-50 text-purple-700 border-purple-200', 'bg-pink-50 text-pink-700 border-pink-200', 'bg-blue-50 text-blue-700 border-blue-200'];
    const chatBadgeFor = (profile) => ({ badge: hashPick(profile || 'x', CHAT_BADGES), name: profileNameFor(profile || 'x') });

