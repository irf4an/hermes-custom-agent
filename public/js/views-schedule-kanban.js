    // ===== Minimal cron engine (5-field: min hour dom mon dow) =====
    const CRON_MONTHS = { jan:1, feb:2, mar:3, apr:4, may:5, jun:6, jul:7, aug:8, sep:9, oct:10, nov:11, dec:12 };
    const CRON_DOWS = { sun:0, mon:1, tue:2, wed:3, thu:4, fri:5, sat:6 };

    function cronFieldSet(field, min, max, names) {
      const out = new Set();
      const addRange = (a, b, step) => {
        step = step && step > 0 ? step : 1;
        for (let v = a; v <= b; v += step) out.add(v);
      };
      const norm = (tok) => {
        const t = String(tok).trim().toLowerCase();
        if (!t) return null;
        if (names && names[t] !== undefined) return names[t];
        const n = parseInt(t, 10);
        return isNaN(n) ? null : n;
      };
      for (const partRaw of String(field).split(',')) {
        const part = partRaw.trim();
        if (!part) continue;
        const slash = part.split('/');
        const body = slash[0];
        const step = slash.length > 1 ? parseInt(slash[1], 10) : 1;
        if (body === '*' || body === '?') {
          addRange(min, max, step);
          continue;
        }
        const dash = body.split('-');
        if (dash.length === 2) {
          const a = norm(dash[0]), b = norm(dash[1]);
          if (a === null || b === null) continue;
          addRange(Math.min(a, b), Math.max(a, b), step);
          continue;
        }
        const v = norm(body);
        if (v === null) continue;
        if (slash.length > 1) addRange(v, max, step);
        else out.add(v);
      }
      return out;
    }

    // Returns {mins,hours,doms,months,dows, domRestricted, dowRestricted} or null when unparseable.
    function parseCron(expr) {
      const parts = String(expr || '').trim().split(/\s+/);
      if (parts.length !== 5) return null;
      const mins = cronFieldSet(parts[0], 0, 59);
      const hours = cronFieldSet(parts[1], 0, 23);
      const doms = cronFieldSet(parts[2], 1, 31);
      const months = cronFieldSet(parts[3], 1, 12, CRON_MONTHS);
      const dows = cronFieldSet(parts[4], 0, 7, CRON_DOWS);
      if (dows.has(7)) dows.add(0);
      if (!mins.size || !hours.size || !doms.size || !months.size || !dows.size) return null;
      return {
        mins, hours, doms, months, dows,
        domRestricted: parts[2].trim() !== '*' && parts[2].trim() !== '?',
        dowRestricted: parts[4].trim() !== '*' && parts[4].trim() !== '?'
      };
    }

    function cronMatchesDate(parsed, date) {
      if (!parsed) return false;
      if (!parsed.months.has(date.getMonth() + 1)) return false;
      const domOk = parsed.doms.has(date.getDate());
      const dowOk = parsed.dows.has(date.getDay());
      // Standard cron: when both DOM and DOW are restricted, either may match.
      if (parsed.domRestricted && parsed.dowRestricted) return domOk || dowOk;
      if (parsed.domRestricted) return domOk;
      if (parsed.dowRestricted) return dowOk;
      return true;
    }

    // Occurrences of a job on a given local calendar day.
    function cronOccurrencesOnDay(job, date) {
      const expr = job.schedule_display || job.schedule;
      let parsed = parseCron(expr);
      if (!parsed) {
        // Interval-style schedules ("every 10m" / "every 2h") — Hermes stores these verbatim.
        const m = String(expr || '').match(/^every\s+(\d+)\s*(m|min|minute|minutes|h|hr|hour|hours)$/i);
        if (!m) return [];
        const n = parseInt(m[1], 10);
        const unit = m[2].toLowerCase();
        const stepMin = unit.startsWith('h') ? n * 60 : n;
        if (!stepMin) return [];
        const times = [];
        for (let mm = 0; mm < 24 * 60; mm += stepMin) {
          times.push({ hour: Math.floor(mm / 60), minute: mm % 60 });
        }
        return times;
      }
      if (!cronMatchesDate(parsed, date)) return [];
      const times = [];
      const hours = [...parsed.hours].sort((a, b) => a - b);
      const mins = [...parsed.mins].sort((a, b) => a - b);
      for (const h of hours) for (const mm of mins) times.push({ hour: h, minute: mm });
      return times;
    }

    function cronTimeLabel(t) {
      return String(t.hour).padStart(2, '0') + ':' + String(t.minute).padStart(2, '0');
    }

    // One entry per job per day: earliest run time + total run count.
    // High-frequency jobs (every 5m) would otherwise emit ~288 rows for a single day.
    function jobsForDay(date) {
      const out = [];
      for (const job of liveScheduleJobs) {
        const times = cronOccurrencesOnDay(job, date);
        if (!times.length) continue;
        times.sort((a, b) => (a.hour * 60 + a.minute) - (b.hour * 60 + b.minute));
        out.push({
          job,
          time: cronTimeLabel(times[0]),
          sort: times[0].hour * 60 + times[0].minute,
          runs: times.length,
          allTimes: times.map(cronTimeLabel)
        });
      }
      return out.sort((a, b) => a.sort - b.sort);
    }

    function scheduleJobCard(job, active, showTime, runs) {
      // ponytail: click opens edit drawer; full hover tip displays schedule details
      const dim = active ? '' : ' opacity-60';
      const count = runs > 1 ? `<span class="ml-1 font-mono text-[9px] opacity-70">x${runs}</span>` : '';
      const dot = active
        ? `<span class="inline-block w-1 h-1 rounded-full ${job.deliver === 'telegram' ? 'bg-blue-500' : 'bg-emerald-500'} mr-1 align-middle"></span>`
        : '<span class="inline-block w-1 h-1 rounded-full bg-slate-400 mr-1 align-middle"></span>';
      const timePart = showTime ? `<span class="font-mono opacity-70 mr-1">${showTime}</span>` : '';
      const tip = `${job.name} — ${job.schedule_display || job.schedule}${runs > 1 ? ` (${runs} runs/day)` : ''} (klik untuk edit)`;
      if (job.deliver === 'telegram') {
        return `<div onclick="openEditSchedule('${job.id}')" class="bg-blue-50 border border-blue-200/70 hover:bg-blue-100 rounded px-1.5 py-0.5 text-[10px] font-semibold text-blue-700 truncate cursor-pointer transition${dim}" title="${escapeHtml(tip)}">${dot}${timePart}${escapeHtml(job.name)}${count}</div>`;
      }
      return `<div onclick="openEditSchedule('${job.id}')" class="bg-slate-100 hover:bg-slate-200/80 rounded px-1.5 py-0.5 text-[10px] font-medium text-slate-700 truncate cursor-pointer transition${dim}" title="${escapeHtml(tip)}">${dot}${timePart}${escapeHtml(job.name)}${count}</div>`;
    }

    async function fetchSchedules() {
      try {
        const d = await api('/api/schedules', {}, 'Gagal memuat jadwal');
        {
          if (Array.isArray(d.schedules)) {
            liveScheduleJobs = d.schedules;
            renderScheduleView();
            updateScheduleDateDisplay();
          }
        }
      } catch (e) {
        console.error('Error fetching schedules:', e);
      }
    }

    async function triggerScheduleRun(id) {
      const button = document.querySelector(`[data-run-schedule="${id}"]`);
      if (button) button.disabled = true;
      try {
        const { status, data } = await apiFull(`/api/schedules/${id}/run`, { method: 'POST' });
        if (status === 202 && data.state === 'queued') {
          alert('Schedule queued. Output akan dikirim Telegram setelah agent selesai.');
        } else if (status === 409 && data.state === 'already_running') {
          alert('Schedule masih berjalan. Tunggu output atau cek log run.');
        } else {
          throw new Error(data.error || data.message || 'Failed to trigger schedule');
        }
        await fetchSchedules();
      } catch (e) {
        alert('Run gagal: ' + e.message);
      } finally {
        if (button) button.disabled = false;
      }
    }

    async function toggleSchedulePause(id, isCurrentlyEnabled) {
      const action = isCurrentlyEnabled ? 'pause' : 'resume';
      try {
        const { ok } = await apiFull(`/api/schedules/${id}/${action}`, { method: 'POST' });
        if (ok) {
          await fetchSchedules();
        } else {
          alert(`Failed to ${action} schedule`);
        }
      } catch (e) {
        alert('Error: ' + e.message);
      }
    }

    async function deleteScheduleJob(id) {
      if (!confirm(`Hapus jadwal cron ${id}?`)) return;
      try {
        const { ok } = await apiFull(`/api/schedules/${id}`, { method: 'DELETE' });
        if (ok) {
          await fetchSchedules();
        } else {
          alert('Failed to delete schedule');
        }
      } catch (e) {
        alert('Error: ' + e.message);
      }
    }

    const scheduleOutputOpen = {};
    function toggleScheduleOutput(id) {
      scheduleOutputOpen[id] = !scheduleOutputOpen[id];
      renderScheduleListView();
    }

    let currentEditScheduleId = null;

    function openEditSchedule(id) {
      currentEditScheduleId = id;
      const job = liveScheduleJobs.find(x => x.id === id);
      if (!job) return;

      const scheduleView = document.getElementById('view-schedule');
      const editScheduleView = document.getElementById('view-edit-schedule');
      const pageTitle = document.getElementById('page-title');

      if (scheduleView) scheduleView.classList.add('hidden');
      if (editScheduleView) editScheduleView.classList.remove('hidden');
      if (pageTitle) pageTitle.textContent = 'Edit schedule';

      document.getElementById('edit-schedule-title').textContent = job.name || job.id;
      document.getElementById('edit-schedule-subtitle').textContent = `${job.schedule_display || job.schedule || ''} · ${job.deliver || 'local'} · ${job.model || 'model resolution'}`;

      const activeCheckbox = document.getElementById('edit-sched-active-checkbox');
      if (activeCheckbox) activeCheckbox.checked = job.enabled !== false;

      document.getElementById('edit-sched-name-input').value = job.name || '';
      document.getElementById('edit-sched-expr-input').value = job.schedule_display || job.schedule || '';
      document.getElementById('edit-sched-deliver-select').value = job.deliver || 'local';
      document.getElementById('edit-sched-prompt-input').value = job.prompt || '';

      const agentSelect = document.getElementById('edit-sched-agent-select');
      if (agentSelect) {
        const availableAgents = (globalProfiles && globalProfiles.length > 0)
          ? globalProfiles.map(p => ({ id: p.id, label: `${p.name || p.id} (${p.id})` }))
          : [
              { id: 'default', label: 'Default' }
            ];

        agentSelect.innerHTML = availableAgents.map(a => `<option value="${a.id}">${a.label}</option>`).join('');
        agentSelect.value = job.recipient_agent || job.agent || 'default';
      }

      const providerSelect = document.getElementById('edit-sched-provider-select');
      if (providerSelect) {
        if (job.provider) {
          providerSelect.value = job.provider;
        } else if (job.model && (job.model.startsWith('opencode') || job.model.startsWith('opencode-free/'))) {
          providerSelect.value = 'opencode-free';
        } else if (job.model && (job.model.includes('codex') || job.model === 'gpt-5.6-luna')) {
          providerSelect.value = 'openai-codex';
        } else if (job.model && job.model.includes('openrouter')) {
          providerSelect.value = 'openrouter';
        } else if (job.model && job.model.includes('nvidia')) {
          providerSelect.value = 'nvidia';
        } else {
          providerSelect.value = '9router';
        }
        onSchedProviderChange(job.model);
      }

      const reasoningSelect = document.getElementById('edit-sched-reasoning-select');
      if (reasoningSelect) {
        reasoningSelect.value = job.reasoning_effort || 'default';
      }

      switchEditScheduleTab('job');
      lucide.createIcons();
    }

    function closeEditSchedule() {
      const scheduleView = document.getElementById('view-schedule');
      const editScheduleView = document.getElementById('view-edit-schedule');
      const pageTitle = document.getElementById('page-title');

      if (editScheduleView) editScheduleView.classList.add('hidden');
      if (scheduleView) scheduleView.classList.remove('hidden');
      if (pageTitle) pageTitle.textContent = 'Schedule';
      lucide.createIcons();
    }

    function switchEditScheduleTab(tab) {
      const tabs = ['job', 'model', 'danger'];
      tabs.forEach(t => {
        const btn = document.getElementById(`edit-sched-tab-${t}`);
        const pane = document.getElementById(`edit-sched-pane-${t}`);
        if (!btn || !pane) return;
        if (t === tab) {
          btn.className = 'px-3.5 py-2 rounded-lg font-semibold bg-white text-blue-600 border border-slate-200/80 shadow-xs flex items-center gap-1.5 transition cursor-pointer';
          pane.classList.remove('hidden');
        } else {
          const isDanger = t === 'danger';
          btn.className = isDanger
            ? 'px-3.5 py-2 rounded-lg font-medium text-red-600 hover:text-red-700 hover:bg-red-50 flex items-center gap-1.5 transition cursor-pointer'
            : 'px-3.5 py-2 rounded-lg font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 flex items-center gap-1.5 transition cursor-pointer';
          pane.classList.add('hidden');
        }
      });
      lucide.createIcons();
    }

    function onSchedProviderChange(targetModel) {
      const provider = document.getElementById('edit-sched-provider-select')?.value;
      const modelSelect = document.getElementById('edit-sched-model-select');
      if (!modelSelect) return;

      let list = [];
      if (provider === '9router') {
        list = nineRouter24Models;
      } else if (provider === 'opencode-free') {
        list = openCodeModels;
      } else if (provider === 'openai-codex') {
        list = [
          { id: 'gpt-5.6-luna', name: 'gpt-5.6-luna (OpenAI Codex)' },
          { id: 'codex-default', name: 'codex-default (OpenAI Codex)' }
        ];
      } else if (provider === 'openrouter') {
        list = [
          { id: 'openrouter/anthropic/claude-3.7-sonnet', name: 'openrouter/anthropic/claude-3.7-sonnet' },
          { id: 'openrouter/google/gemini-2.5-pro', name: 'openrouter/google/gemini-2.5-pro' },
          { id: 'openrouter/deepseek/deepseek-r1', name: 'openrouter/deepseek/deepseek-r1' }
        ];
      } else if (provider === 'nvidia') {
        list = [
          { id: 'nvidia/nvidia/nemotron-3-super-170b-a17b', name: 'nvidia/nemotron-3-super-170b-a17b' },
          { id: 'nvidia/deepseek-ai/deepseek-r1', name: 'nvidia/deepseek-ai/deepseek-r1' }
        ];
      }

      modelSelect.innerHTML = list.map(m => `<option value="${m.id}">${m.name}</option>`).join('');

      const mToSet = targetModel || (list.length > 0 ? list[0].id : '');
      if (mToSet) {
        if (!list.some(m => m.id === mToSet)) {
          const opt = document.createElement('option');
          opt.value = mToSet;
          opt.textContent = `${mToSet} (Configured)`;
          modelSelect.appendChild(opt);
        }
        modelSelect.value = mToSet;
      }
    }

    function setSchedPreset(expr) {
      const input = document.getElementById('edit-sched-expr-input');
      if (input) input.value = expr;
    }

    async function saveScheduleJobDetails() {
      if (!currentEditScheduleId) return;
      const name = document.getElementById('edit-sched-name-input')?.value?.trim();
      const schedule = document.getElementById('edit-sched-expr-input')?.value?.trim();
      const deliver = document.getElementById('edit-sched-deliver-select')?.value;
      const recipient_agent = document.getElementById('edit-sched-agent-select')?.value || 'default';
      const prompt = document.getElementById('edit-sched-prompt-input')?.value;
      const enabled = document.getElementById('edit-sched-active-checkbox')?.checked;

      if (!name) {
        alert('Job name cannot be empty');
        return;
      }
      if (!schedule) {
        alert('Schedule expression cannot be empty');
        return;
      }

      try {
        const { ok, data } = await apiFull(`/api/schedules/${currentEditScheduleId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, schedule, deliver, recipient_agent, prompt, enabled })
        });
        if (ok && data.success) {
          alert('Schedule configuration saved successfully');
          await fetchSchedules();
          closeEditSchedule();
        } else {
          alert('Failed to save schedule: ' + (data.error || 'Unknown error'));
        }
      } catch (err) {
        alert('Error saving schedule: ' + err.message);
      }
    }

    async function saveScheduleModelDetails() {
      if (!currentEditScheduleId) return;
      const provider = document.getElementById('edit-sched-provider-select')?.value;
      const model = document.getElementById('edit-sched-model-select')?.value;
      const reasoning_effort = document.getElementById('edit-sched-reasoning-select')?.value;

      try {
        const { ok, data } = await apiFull(`/api/schedules/${currentEditScheduleId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider, model, reasoning_effort })
        });
        if (ok && data.success) {
          alert('Model configuration saved successfully');
          await fetchSchedules();
          closeEditSchedule();
        } else {
          alert('Failed to save model: ' + (data.error || 'Unknown error'));
        }
      } catch (err) {
        alert('Error saving model: ' + err.message);
      }
    }

    function renderScheduleListView() {
      const container = document.getElementById('schedule-list-view');
      if (!container) return;

      if (liveScheduleJobs.length === 0) {
        container.innerHTML = '<div class="bg-white border border-slate-200 rounded-xl p-8 text-center text-xs text-slate-500">No scheduled cron jobs found in Hermes. Create one with <code>hermes cron create</code>.</div>';
        return;
      }

      container.innerHTML = liveScheduleJobs.map(job => {
        const cronExpr = job.schedule_display || job.schedule || '* * * * *';
        const nextRun = job.next_run_at ? `next: ${new Date(job.next_run_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'scheduled';
        const target = job.deliver || 'local';
        const lastRunText = job.last_run_at
          ? `Last run ${new Date(job.last_run_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} · ${job.last_status || 'ok'}`
          : 'Awaiting execution tick · scheduled';
        const isError = job.last_status === 'error';
        const isPaused = !job.enabled;
        const executionState = job.execution_state || (isError ? 'failed' : 'idle');
        const executionLabel = { running: 'RUNNING', failed: 'FAILED', completed: 'COMPLETED', idle: 'IDLE' }[executionState] || executionState.toUpperCase();
        const executionClass = executionState === 'running' ? 'bg-blue-100 text-blue-700' : executionState === 'failed' ? 'bg-red-100 text-red-700' : executionState === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600';
        const outputPreview = job.output ? job.output.replace(/</g, '&lt;').replace(/>/g, '&gt;').slice(-1200) : '';
        const executionDetail = executionState === 'running' ? 'Agent sedang bekerja…' : (job.last_error || job.last_delivery_error || (outputPreview ? 'Output tersedia' : 'Belum ada output'));


        return `
          <div class="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:shadow-md transition ${isPaused ? 'opacity-70 bg-slate-50/50' : ''}">
            <!-- Card Header -->
            <div class="flex items-start justify-between gap-4">
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2">
                  <h4 class="text-sm md:text-base font-bold text-slate-900 leading-tight truncate">${job.name}</h4>
                  <span class="${isPaused ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-700'} text-[10px] font-bold px-1.5 py-0.5 rounded">${isPaused ? 'PAUSED · OFF' : 'ACTIVE · ON'}</span>
                  <span class="${executionClass} text-[10px] font-bold px-1.5 py-0.5 rounded">${executionLabel}</span>
                </div>
                <div class="flex items-center gap-1.5 flex-wrap text-xs text-slate-500 mt-1">
                  <span class="font-mono bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded text-[11px] font-semibold">${cronExpr}</span>
                  <span>•</span>
                  <span>${nextRun}</span>
                  <span>•</span>
                  <span class="font-mono text-slate-600 font-medium">→ ${target}</span>
                  ${job.recipient_agent ? `<span>•</span><span class="inline-flex items-center gap-1 font-medium text-blue-700 bg-blue-50 border border-blue-200/60 px-1.5 py-0.5 rounded text-[11px]"><i data-lucide="bot" class="w-3 h-3"></i><span>${job.recipient_agent}</span></span>` : ''}
                </div>
              </div>

              <!-- Action Cluster Pill -->
              <div class="flex items-center gap-1 border border-slate-200 rounded-lg p-1 bg-white shadow-2xs flex-shrink-0">
                <button onclick="openEditSchedule('${job.id}')" class="p-1 hover:text-blue-600 text-slate-400 hover:bg-slate-50 rounded transition cursor-pointer" title="Edit schedule & model">
                  <i data-lucide="edit-3" class="w-3.5 h-3.5"></i>
                </button>
                <button onclick="toggleSchedulePause('${job.id}', ${job.enabled})" class="p-1 ${job.enabled ? 'text-emerald-600 hover:text-amber-700 hover:bg-amber-50' : 'text-amber-600 hover:text-emerald-700 hover:bg-emerald-50'} rounded transition cursor-pointer" title="${job.enabled ? 'Pause schedule (turn OFF)' : 'Resume schedule (turn ON)'}" aria-label="${job.enabled ? 'Pause schedule' : 'Resume schedule'}">
                  <i data-lucide="${job.enabled ? 'pause' : 'play'}" class="w-3.5 h-3.5"></i>
                </button>
                <button data-run-schedule="${job.id}" onclick="triggerScheduleRun('${job.id}')" class="p-1 hover:text-blue-600 text-slate-400 hover:bg-slate-50 rounded transition cursor-pointer" title="Run now">
                  <i data-lucide="zap" class="w-3.5 h-3.5"></i>
                </button>
                <button onclick="deleteScheduleJob('${job.id}')" class="p-1 hover:text-red-600 text-red-400 hover:bg-slate-50 rounded transition cursor-pointer" title="Delete schedule">
                  <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                </button>
              </div>
            </div>

            <!-- Card Body -->
            <p class="text-xs text-slate-600 leading-relaxed my-3 line-clamp-2">
              ${job.prompt || 'No instruction prompt provided.'}
            </p>

            <div class="text-[11px] ${executionState === 'failed' ? 'text-red-600' : 'text-slate-500'} mb-2">${executionDetail}</div>
            ${outputPreview ? `
              <div class="mb-3">
                <button onclick="toggleScheduleOutput('${job.id}')" class="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 border border-slate-200/80 px-2.5 py-1 rounded-md transition cursor-pointer">
                  <i data-lucide="${scheduleOutputOpen[job.id] ? 'chevron-up' : 'terminal'}" class="w-3.5 h-3.5 text-slate-500"></i>
                  <span>${scheduleOutputOpen[job.id] ? 'Hide output' : 'Show output'}</span>
                </button>
                <div id="schedule-output-${job.id}" class="${scheduleOutputOpen[job.id] ? '' : 'hidden'} mt-2">
                  <pre class="max-h-56 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-950 text-slate-100 p-3 text-[10px] leading-relaxed font-mono">${outputPreview}</pre>
                </div>
              </div>
            ` : ''}

            <!-- Card Footer -->
            <div class="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100 flex-wrap gap-2">
              <div>
                ${isError ? `
                  <span>Last run ${lastRunText.split('·')[0]}· </span>
                  <span class="text-red-500 font-semibold font-mono">error</span>
                ` : `
                  <span>${lastRunText}</span>
                `}
              </div>

              ${job.model ? `
                <div class="font-mono text-[11px] text-slate-400">
                  model: <span class="text-slate-600">${job.model}</span>
                </div>
              ` : ''}
            </div>
          </div>
        `;
      }).join('');

      lucide.createIcons();
    }

    function getSundayOfWeek(d) {
      const date = new Date(d);
      const day = date.getDay(); // 0 is Sunday
      const diff = date.getDate() - day;
      return new Date(date.setDate(diff));
    }

    function updateScheduleDateDisplay() {
      const el = document.getElementById('schedule-date-display');
      if (!el) return;
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const fullMonths = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

      if (currentScheduleMode === 'month') {
        el.textContent = `${fullMonths[currentScheduleDate.getMonth()]} ${currentScheduleDate.getFullYear()}`;
      } else if (currentScheduleMode === 'week') {
        const sun = getSundayOfWeek(currentScheduleDate);
        const sat = new Date(sun);
        sat.setDate(sun.getDate() + 6);

        const mSun = months[sun.getMonth()];
        const mSat = months[sat.getMonth()];
        const ySun = sun.getFullYear();
        const ySat = sat.getFullYear();

        if (mSun === mSat && ySun === ySat) {
          el.textContent = `${mSun} ${sun.getDate()} – ${sat.getDate()}, ${ySun}`;
        } else if (ySun === ySat) {
          el.textContent = `${mSun} ${sun.getDate()} – ${mSat} ${sat.getDate()}, ${ySun}`;
        } else {
          el.textContent = `${mSun} ${sun.getDate()}, ${ySun} – ${mSat} ${sat.getDate()}, ${ySat}`;
        }
      } else {
        el.textContent = `${days[currentScheduleDate.getDay()]}, ${fullMonths[currentScheduleDate.getMonth()]} ${currentScheduleDate.getDate()}`;
      }
    }

    function changeSchedulePeriod(delta) {
      if (currentScheduleMode === 'month') {
        currentScheduleDate.setMonth(currentScheduleDate.getMonth() + delta);
      } else if (currentScheduleMode === 'week') {
        currentScheduleDate.setDate(currentScheduleDate.getDate() + (delta * 7));
      } else {
        currentScheduleDate.setDate(currentScheduleDate.getDate() + delta);
      }
      updateScheduleDateDisplay();
      renderScheduleView();
    }

    function setScheduleDateToday() {
      currentScheduleDate = new Date();
      updateScheduleDateDisplay();
      renderScheduleView();
    }

    function switchScheduleViewMode(mode) {
      currentScheduleMode = mode;
      const tabs = ['day', 'week', 'month', 'list'];
      tabs.forEach(t => {
        const btn = document.getElementById(`sched-tab-${t}`);
        if (!btn) return;
        if (t === mode) {
          btn.className = 'px-3 py-1.5 rounded-md font-semibold bg-white text-blue-600 shadow-sm border border-slate-200/60' + (t === 'list' ? ' flex items-center gap-1' : '');
        } else {
          btn.className = 'px-3 py-1.5 rounded-md font-medium text-slate-600 hover:text-slate-900 transition' + (t === 'list' ? ' flex items-center gap-1' : '');
        }
      });
      updateScheduleDateDisplay();
      renderScheduleView();
    }

    function renderScheduleView() {
      const frame = document.getElementById('schedule-calendar-frame');
      const weekGrid = document.getElementById('schedule-week-grid');
      const monthGrid = document.getElementById('schedule-month-grid');
      const dayList = document.getElementById('schedule-timeline-list');
      const listView = document.getElementById('schedule-list-view');
      if (!frame) return;

      if (currentScheduleMode === 'list') {
        frame.classList.add('hidden');
        if (listView) {
          listView.classList.remove('hidden');
          renderScheduleListView();
        }
      } else {
        frame.classList.remove('hidden');
        if (listView) listView.classList.add('hidden');

        if (currentScheduleMode === 'month') {
          if (monthGrid) monthGrid.classList.remove('hidden');
          if (weekGrid) weekGrid.classList.add('hidden');
          if (dayList) dayList.classList.add('hidden');
          renderScheduleMonthView();
        } else if (currentScheduleMode === 'week') {
          if (monthGrid) monthGrid.classList.add('hidden');
          if (weekGrid) weekGrid.classList.remove('hidden');
          if (dayList) dayList.classList.add('hidden');
          renderScheduleWeekView();
        } else {
          if (monthGrid) monthGrid.classList.add('hidden');
          if (weekGrid) weekGrid.classList.add('hidden');
          if (dayList) dayList.classList.remove('hidden');
          renderScheduleDayView();
        }
      }
    }

    const SCHED_MAX_CARDS = 3;

    function jumpScheduleDay(y, m, d) {
      // ponytail: switch to day view for target date; instant detail inspection
      currentScheduleDate = new Date(y, m, d);
      switchScheduleViewMode('day');
    }

    function renderScheduleMonthView() {
      const cellsContainer = document.getElementById('schedule-month-cells');
      if (!cellsContainer) return;

      const year = currentScheduleDate.getFullYear();
      const month = currentScheduleDate.getMonth();
      const firstDay = new Date(year, month, 1);
      const startDate = new Date(year, month, 1 - firstDay.getDay()); // back to Sunday
      const todayDate = new Date();

      let html = '';
      for (let i = 0; i < 42; i++) {
        const current = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + i);
        const isCurrentMonth = current.getMonth() === month;
        const isToday = current.toDateString() === todayDate.toDateString();
        const cy = current.getFullYear(), cm = current.getMonth(), cd = current.getDate();

        const dateBadge = isToday
          ? `<button type="button" onclick="jumpScheduleDay(${cy}, ${cm}, ${cd})" class="w-5 h-5 rounded-full bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center cursor-pointer hover:ring-2 hover:ring-blue-300 transition" title="Buka timeline ${cd}">${cd}</button>`
          : `<button type="button" onclick="jumpScheduleDay(${cy}, ${cm}, ${cd})" class="text-xs cursor-pointer ${isCurrentMonth ? 'font-semibold text-slate-700 hover:text-blue-600' : 'font-medium text-slate-400 hover:text-slate-600'} transition" title="Buka timeline ${cd}">${cd}</button>`;

        const dayJobs = jobsForDay(current);
        const shown = dayJobs.slice(0, SCHED_MAX_CARDS);
        const cardsHtml = shown.map(e => scheduleJobCard(e.job, e.job.enabled, false, e.runs)).join('');
        const remaining = dayJobs.length - shown.length;
        const overflowHtml = remaining > 0
          ? `<button type="button" onclick="jumpScheduleDay(${cy}, ${cm}, ${cd})" class="text-[10px] font-semibold text-blue-600 hover:text-blue-800 hover:underline cursor-pointer pt-1 text-left block w-full truncate transition" title="Lihat semua ${dayJobs.length} task">+${remaining} more →</button>`
          : '';

        html += `
          <div class="border-b border-r border-slate-200 p-2 min-h-[106px] flex flex-col justify-between ${isCurrentMonth ? 'bg-white' : 'bg-slate-50/40'} hover:bg-slate-50/70 transition">
            <div class="flex justify-end mb-1">${dateBadge}</div>
            <div class="space-y-1 flex-1 min-w-0">${cardsHtml}</div>
            ${overflowHtml}
          </div>
        `;
      }

      cellsContainer.innerHTML = html;
      lucide.createIcons();
    }

    function renderScheduleDayView() {
      const container = document.getElementById('schedule-timeline-list');
      if (!container) return;

      const dayJobs = jobsForDay(currentScheduleDate);
      const dateLabel = currentScheduleDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });

      if (dayJobs.length === 0) {
        container.innerHTML = `<div class="py-12 px-4 text-center text-slate-400">
            <i data-lucide="calendar-off" class="w-6 h-6 mx-auto mb-2 text-slate-300"></i>
            <p class="font-medium text-slate-600 text-xs">No cron runs scheduled on ${dateLabel}</p>
            <p class="text-[11px] text-slate-400 mt-0.5">${liveScheduleJobs.length} job${liveScheduleJobs.length === 1 ? '' : 's'} terdaftar di Hermes — tidak ada yang jatuh pada hari ini.</p>
          </div>`;
        lucide.createIcons();
        return;
      }

      container.innerHTML = dayJobs.map(e => {
        const job = e.job;
        const statusPill = job.enabled
          ? '<span class="bg-emerald-100 text-emerald-700 text-[10px] font-bold px-1.5 py-0.5 rounded">ACTIVE · ON</span>'
          : '<span class="bg-amber-100 text-amber-800 text-[10px] font-bold px-1.5 py-0.5 rounded">PAUSED · OFF</span>';
        const agent = job.recipient_agent || job.profile || 'default';
        const lastRun = job.last_run_at ? `last: ${new Date(job.last_run_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : 'belum pernah jalan';
        return `
          <div class="px-5 py-3 hover:bg-slate-50/70 transition flex items-start gap-4 text-xs cursor-pointer" onclick="openEditSchedule('${job.id}')">
            <div class="font-mono font-semibold text-slate-700 w-14 text-left flex-shrink-0 pt-0.5">${e.time}</div>
            <div class="w-2 h-2 mt-1 rounded-full ${job.enabled ? (job.deliver === 'telegram' ? 'bg-blue-500 ring-2 ring-blue-100' : 'bg-emerald-500 ring-2 ring-emerald-100') : 'bg-slate-300'} flex-shrink-0"></div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="font-semibold text-slate-900">${escapeHtml(job.name)}</span>
                ${statusPill}
                <span class="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-slate-100 text-slate-600 border border-slate-200">${escapeHtml(agent)}</span>
              </div>
              <div class="text-[11px] text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap font-mono">
                <span>${job.schedule_display || job.schedule}</span>
                ${e.runs > 1 ? `<span class="text-slate-300">•</span><span class="text-slate-600 font-semibold">${e.runs}x / hari</span>` : ''}
                <span class="text-slate-300">•</span>
                <span>→ ${job.deliver || 'local'}</span>
                <span class="text-slate-300">•</span>
                <span>${lastRun}</span>
                ${job.last_status ? `<span class="text-slate-300">•</span><span class="${job.last_status === 'ok' ? 'text-emerald-600' : 'text-rose-600'}">${job.last_status}</span>` : ''}
              </div>
            </div>
            <i data-lucide="chevron-right" class="w-4 h-4 text-slate-300 flex-shrink-0 mt-0.5"></i>
          </div>
        `;
      }).join('');

      lucide.createIcons();
    }

    function renderScheduleWeekView() {
      // ponytail: show all jobs directly in week columns; vertical scroll handles high density
      const colsContainer = document.getElementById('schedule-week-cols');
      if (!colsContainer) return;

      const sun = getSundayOfWeek(currentScheduleDate);
      const weekDays = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
      const todayDate = new Date();

      colsContainer.innerHTML = weekDays.map((dayName, idx) => {
        const d = new Date(sun.getFullYear(), sun.getMonth(), sun.getDate() + idx);
        const isToday = d.toDateString() === todayDate.toDateString();
        const cy = d.getFullYear(), cm = d.getMonth(), cd = d.getDate();

        const dateHeaderBadge = isToday
          ? `<button type="button" onclick="jumpScheduleDay(${cy}, ${cm}, ${cd})" class="w-5 h-5 rounded-full bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center cursor-pointer hover:ring-2 hover:ring-blue-300 transition" title="Buka timeline">${cd}</button>`
          : `<button type="button" onclick="jumpScheduleDay(${cy}, ${cm}, ${cd})" class="text-xs font-semibold text-slate-700 hover:text-blue-600 cursor-pointer transition" title="Buka timeline">${cd}</button>`;

        const dayJobs = jobsForDay(d);
        // Tampilkan semua task tanpa dipotong agar seluruh jadwal mingguan terlihat langsung
        const cardsMarkup = dayJobs.length > 0
          ? dayJobs.map(e => scheduleJobCard(e.job, e.job.enabled, e.time, e.runs)).join('')
          : '<div class="text-[11px] text-slate-300 italic pt-4 text-center">no runs</div>';

        return `
          <div class="flex flex-col min-h-[420px] ${isToday ? 'bg-blue-50/30' : 'bg-white'}">
            <div class="px-2.5 py-2 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
              <span class="text-[10.5px] font-bold text-slate-500 uppercase tracking-wider">${dayName}</span>
              ${dateHeaderBadge}
            </div>
            <div class="p-2 space-y-1.5 flex-1 flex flex-col justify-start overflow-y-auto max-h-[520px]">${cardsMarkup}</div>
            <div class="px-2 py-1.5 border-t border-slate-100 text-center text-[10px] text-slate-400 font-medium bg-slate-50/30">
              <button type="button" onclick="jumpScheduleDay(${cy}, ${cm}, ${cd})" class="hover:text-blue-600 hover:underline cursor-pointer transition">
                ${dayJobs.length} job${dayJobs.length === 1 ? '' : 's'} · timeline →
              </button>
            </div>
          </div>
        `;
      }).join('');

      lucide.createIcons();
    }

    function toggleSidebar(open) {
      const sidebar = document.getElementById('app-sidebar');
      const backdrop = document.getElementById('sidebar-backdrop');
      if (!sidebar || !backdrop) return;
      if (open === undefined) {
        open = !sidebar.classList.contains('open');
      }
      if (open) {
        sidebar.classList.add('open');
        backdrop.classList.add('active');
        document.body.style.overflow = 'hidden';
      } else {
        sidebar.classList.remove('open');
        backdrop.classList.remove('active');
        document.body.style.overflow = '';
      }
    }

    let currentDocsAgent = 'default';
    let currentDocsData = null;
    let currentDocsActiveFile = null;
    let isDocsEditing = false;
    let docsOriginalContent = '';

    async function loadDocsView() {
      const profiles = globalProfiles; // live data; empty until /api/profiles resolves

      const countEl = document.getElementById('docs-agents-count');
      if (countEl) countEl.textContent = profiles.length;

      // Render agent list in pane 1
      renderDocsAgentsList(profiles);

      // Fetch docs for currentDocsAgent
      await fetchDocsForAgent(currentDocsAgent);
    }

    function renderDocsAgentsList(profiles) {
      const agentsList = document.getElementById('docs-agents-list');
      if (!agentsList) return;

      const filterVal = (document.getElementById('docs-agent-filter')?.value || '').toLowerCase();
      const filtered = profiles.filter(p => !filterVal || p.name.toLowerCase().includes(filterVal) || p.id.toLowerCase().includes(filterVal));

      agentsList.innerHTML = filtered.map(p => {
        const isSelected = p.id === currentDocsAgent;
        const initials = getInitials(p.name || p.id);
        const avatarStyle = getAvatarColor(p.id);
        const isOnline = p.gatewayStatus === 'running';
        const model = p.model || 'ag/gemini-3.7-flash-high';

        const rowBg = isSelected ? 'bg-sky-50/80 border-sky-500 font-semibold' : 'border-transparent hover:bg-slate-50';

        return `
          <div onclick="selectDocsAgent('${p.id}')" class="p-3 flex items-center gap-3 cursor-pointer border-l-2 ${rowBg} transition select-agent-item" id="docs-agent-row-${p.id}">
            <div class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-xs flex-shrink-0" style="${avatarStyle}">
              ${initials}
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex items-center justify-between gap-1">
                <span class="text-xs font-bold text-slate-900 truncate">${p.name}</span>
                <span class="w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-slate-300'} flex-shrink-0"></span>
              </div>
              <div class="text-[11px] font-mono text-slate-400 truncate mt-0.5">${model}</div>
            </div>
          </div>
        `;
      }).join('');

      lucide.createIcons();
    }

    function filterDocsAgents() {
      const profiles = globalProfiles; // live data; empty until /api/profiles resolves
      renderDocsAgentsList(profiles);
    }

    async function selectDocsAgent(agentId) {
      if (isDocsEditing && docsOriginalContent) {
        const editor = document.getElementById('docs-file-editor');
        if (editor && editor.value !== docsOriginalContent) {
          if (!confirm('You have unsaved changes in the current file. Discard and switch agent?')) {
            return;
          }
        }
      }
      currentDocsAgent = agentId;
      currentDocsActiveFile = null;
      isDocsEditing = false;
      const emptyPane = document.getElementById('docs-preview-empty');
      const activePane = document.getElementById('docs-preview-active');
      if (emptyPane) emptyPane.classList.remove('hidden');
      if (activePane) activePane.classList.add('hidden');

      const profiles = globalProfiles; // live data; empty until /api/profiles resolves
      renderDocsAgentsList(profiles);
      await fetchDocsForAgent(agentId);
    }

    async function reloadCurrentAgentDocs() {
      await fetchDocsForAgent(currentDocsAgent);
    }

    async function fetchDocsForAgent(agentId) {
      const treeContainer = document.getElementById('docs-explorer-tree');
      const titleEl = document.getElementById('docs-explorer-title');
      const basePathEl = document.getElementById('docs-base-path');
      if (!treeContainer) return;

      const uppercaseName = agentId.toUpperCase();
      titleEl.textContent = `${uppercaseName} / FILES`;

      try {
        const { ok: docsOk, data } = await apiFull(`/api/agent-docs?agent=${agentId}`);
        if (docsOk) {
          currentDocsData = data;
          basePathEl.textContent = data.basePath || (agentId === 'default' ? '~/.hermes' : `~/.hermes/profiles/${agentId}`);
          renderDocsTree(data.docs);
        } else {
          treeContainer.innerHTML = `<div class="text-xs text-slate-400 p-4 text-center">Failed to load files</div>`;
        }
      } catch (e) {
        treeContainer.innerHTML = `<div class="text-xs text-slate-400 p-4 text-center">Error reading file directory</div>`;
      }
    }

    function renderDocsTree(docs) {
      const container = document.getElementById('docs-explorer-tree');
      if (!container || !docs) return;

      const folders = docs.folders || {};
      const rootFiles = docs.rootFiles || [];
      const workspaces = docs.taskWorkspaces || [];

      let html = '';

      // Section 1: PROFILE DOCS
      html += `
        <div>
          <div class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">PROFILE DOCS</div>
          <div class="space-y-1">
      `;

      // Folder accordions
      for (const [folderName, files] of Object.entries(folders)) {
        html += `
          <details class="group select-none" open>
            <summary class="flex items-center gap-1.5 py-1 px-1.5 rounded hover:bg-slate-100 cursor-pointer text-slate-700 font-medium">
              <span class="text-[9px] text-slate-400 transition-transform group-open:rotate-90">▶</span>
              <i data-lucide="folder" class="w-3.5 h-3.5 text-amber-500 fill-amber-100"></i>
              <span>${folderName}</span>
              <span class="text-[10px] text-slate-400 ml-auto font-mono">${files.length}</span>
            </summary>
            <div class="pl-5 space-y-0.5 mt-0.5 border-l border-slate-100 ml-2.5">
              ${files.map(f => {
                const isSelected = currentDocsActiveFile && currentDocsActiveFile.relPath === f.relPath;
                const itemClass = isSelected ? 'bg-blue-50 text-blue-700 font-semibold ring-1 ring-blue-200/80 shadow-2xs' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100';
                const iconColor = isSelected ? 'text-blue-600' : 'text-slate-400 group-hover/file:text-slate-600';
                return `
                  <div data-doc-path="${f.relPath}" onclick="selectDocsFile('${f.relPath}', '${f.name}')" class="docs-file-item flex items-center gap-1.5 py-1 px-1.5 rounded cursor-pointer transition ${itemClass} group/file">
                    <i data-lucide="file-text" class="w-3.5 h-3.5 ${iconColor} flex-shrink-0"></i>
                    <span class="truncate font-mono text-[11.5px]">${f.name}</span>
                  </div>
                `;
              }).join('')}
            </div>
          </details>
        `;
      }

      // Root files
      rootFiles.forEach(f => {
        const isSelected = currentDocsActiveFile && currentDocsActiveFile.relPath === f.relPath;
        const itemClass = isSelected ? 'bg-blue-50 text-blue-700 font-semibold ring-1 ring-blue-200/80 shadow-2xs' : 'text-slate-700 hover:text-slate-900 hover:bg-slate-100';
        const iconColor = isSelected ? 'text-blue-600' : 'text-slate-400 group-hover/file:text-slate-600';
        const iconName = f.name.endsWith('.md') ? 'file-text' : (f.name.endsWith('.yaml') || f.name.endsWith('.json') ? 'file-code' : 'file');
        html += `
          <div data-doc-path="${f.relPath}" onclick="selectDocsFile('${f.relPath}', '${f.name}')" class="docs-file-item flex items-center gap-1.5 py-1 px-1.5 rounded cursor-pointer transition ${itemClass} group/file">
            <i data-lucide="${iconName}" class="w-3.5 h-3.5 ${iconColor} flex-shrink-0"></i>
            <span class="truncate font-mono text-[11.5px]">${f.name}</span>
          </div>
        `;
      });

      html += `
          </div>
        </div>
      `;

      // Section 2: TASK WORKSPACES
      html += `
        <div class="pt-2 border-t border-slate-100">
          <div class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">TASK WORKSPACES</div>
          ${workspaces.length > 0 ? `
            <div class="space-y-1">
              ${workspaces.map(ws => `
                <div class="flex items-center gap-1.5 py-1 px-1.5 rounded hover:bg-slate-100 cursor-pointer text-slate-700 font-mono text-[11.5px]">
                  <i data-lucide="folder-git-2" class="w-3.5 h-3.5 text-indigo-500"></i>
                  <span class="truncate">${ws}</span>
                </div>
              `).join('')}
            </div>
          ` : `
            <div class="text-[11px] text-slate-400 italic px-1">No task workspaces for this agent yet.</div>
          `}
        </div>
      `;

      container.innerHTML = html;
      lucide.createIcons();
    }

    function updateDocsTreeActiveState(activeRelPath) {
      document.querySelectorAll('.docs-file-item').forEach(el => {
        const isThis = el.getAttribute('data-doc-path') === activeRelPath;
        const icon = el.querySelector('i, svg');
        if (isThis) {
          el.className = 'docs-file-item flex items-center gap-1.5 py-1 px-1.5 rounded cursor-pointer transition bg-blue-50 text-blue-700 font-semibold ring-1 ring-blue-200/80 shadow-2xs group/file';
          if (icon) {
            icon.classList.remove('text-slate-400');
            icon.classList.add('text-blue-600');
          }
        } else {
          el.className = 'docs-file-item flex items-center gap-1.5 py-1 px-1.5 rounded cursor-pointer transition text-slate-600 hover:text-slate-900 hover:bg-slate-100 group/file';
          if (icon) {
            icon.classList.remove('text-blue-600');
            icon.classList.add('text-slate-400');
          }
        }
      });
    }

    async function selectDocsFile(relPath, fileName) {
      const editor = document.getElementById('docs-file-editor');
      if (isDocsEditing && editor && editor.value !== docsOriginalContent) {
        if (!confirm('You have unsaved changes in the current file. Discard and switch file?')) {
          return;
        }
      }

      currentDocsActiveFile = { relPath, fileName };
      updateDocsTreeActiveState(relPath);

      const emptyPane = document.getElementById('docs-preview-empty');
      const activePane = document.getElementById('docs-preview-active');
      const nameEl = document.getElementById('docs-file-name');
      const pathEl = document.getElementById('docs-file-path');
      const metaEl = document.getElementById('docs-file-meta');
      const contentEl = document.getElementById('docs-file-content');
      const badge = document.getElementById('docs-file-status-badge');

      nameEl.textContent = fileName;
      pathEl.textContent = `${currentDocsAgent}/${relPath}`;
      metaEl.textContent = 'Loading...';
      contentEl.textContent = 'Loading content...';
      if (badge) badge.classList.add('hidden');

      emptyPane.classList.add('hidden');
      activePane.classList.remove('hidden');

      setupDocsEditorListeners();

      try {
        const { ok: docOk, data: d } = await apiFull(`/api/agent-doc-content?agent=${currentDocsAgent}&path=${encodeURIComponent(relPath)}`);
        if (docOk) {
          const kb = (d.size / 1024).toFixed(1);
          metaEl.textContent = `${kb} KB`;
          docsOriginalContent = d.content || '';
          contentEl.textContent = d.content || '(Empty file)';
          if (editor) editor.value = docsOriginalContent;
          updateEditorCharCount();
        } else {
          metaEl.textContent = 'Error';
          contentEl.textContent = 'Could not load file content.';
          docsOriginalContent = '';
        }
      } catch (e) {
        metaEl.textContent = 'Error';
        contentEl.textContent = 'Failed to fetch file content.';
        docsOriginalContent = '';
      }

      toggleDocsEditMode(false);
      lucide.createIcons();
    }

    function toggleDocsEditMode(forceMode) {
      if (!currentDocsActiveFile) return;
      const viewEl = document.getElementById('docs-file-content');
      const editorContainer = document.getElementById('docs-file-editor-container');
      const editor = document.getElementById('docs-file-editor');
      const editBtnText = document.getElementById('docs-edit-btn-text');
      const editBtnIcon = document.getElementById('docs-edit-btn-icon');
      const saveBtn = document.getElementById('docs-save-btn');
      const badge = document.getElementById('docs-file-status-badge');

      isDocsEditing = (forceMode !== undefined) ? forceMode : !isDocsEditing;

      if (isDocsEditing) {
        viewEl.classList.add('hidden');
        editorContainer.classList.remove('hidden');
        if (editor) {
          editor.value = docsOriginalContent;
          editor.focus();
        }
        if (editBtnText) editBtnText.textContent = 'Preview';
        if (editBtnIcon) editBtnIcon.setAttribute('data-lucide', 'eye');
        if (saveBtn) saveBtn.classList.remove('hidden');
        updateEditorCharCount();
      } else {
        viewEl.classList.remove('hidden');
        editorContainer.classList.add('hidden');
        if (editBtnText) editBtnText.textContent = 'Edit';
        if (editBtnIcon) editBtnIcon.setAttribute('data-lucide', 'edit-3');
        if (editor && editor.value === docsOriginalContent) {
          if (saveBtn) saveBtn.classList.add('hidden');
          if (badge) badge.classList.add('hidden');
        }
      }
      lucide.createIcons();
    }

    function updateEditorCharCount() {
      const editor = document.getElementById('docs-file-editor');
      const countEl = document.getElementById('docs-editor-cursor-pos');
      if (!editor || !countEl) return;
      const val = editor.value || '';
      const lines = val ? val.split('\n').length : 0;
      countEl.textContent = `${lines} lines · ${val.length} chars`;

      const badge = document.getElementById('docs-file-status-badge');
      const isDirty = (val !== docsOriginalContent);
      if (badge) {
        if (isDirty) {
          badge.classList.remove('hidden');
        } else {
          badge.classList.add('hidden');
        }
      }
    }

    async function saveDocsFileContent() {
      if (!currentDocsActiveFile) return;
      const editor = document.getElementById('docs-file-editor');
      const saveBtn = document.getElementById('docs-save-btn');
      const metaEl = document.getElementById('docs-file-meta');
      const viewEl = document.getElementById('docs-file-content');
      const badge = document.getElementById('docs-file-status-badge');
      if (!editor || !saveBtn) return;

      const newContent = editor.value;
      saveBtn.disabled = true;
      saveBtn.innerHTML = '<i data-lucide="loader-2" class="w-3 h-3 animate-spin"></i><span>Saving...</span>';
      lucide.createIcons();

      try {
        const { ok: docSaveOk, data } = await apiFull('/api/agent-doc-content', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agent: currentDocsAgent,
            path: currentDocsActiveFile.relPath,
            content: newContent
          })
        });

        if (docSaveOk && data.success) {
          docsOriginalContent = newContent;
          if (viewEl) viewEl.textContent = newContent || '(Empty file)';
          if (metaEl && data.size !== undefined) {
            metaEl.textContent = `${(data.size / 1024).toFixed(1)} KB`;
          }
          if (badge) badge.classList.add('hidden');
          saveBtn.innerHTML = '<i data-lucide="check" class="w-3 h-3"></i><span>Saved</span>';
          saveBtn.classList.remove('bg-blue-600', 'hover:bg-blue-700');
          saveBtn.classList.add('bg-emerald-600', 'hover:bg-emerald-700');
          lucide.createIcons();
          setTimeout(() => {
            saveBtn.innerHTML = '<i data-lucide="save" class="w-3 h-3"></i><span>Save</span>';
            saveBtn.classList.remove('bg-emerald-600', 'hover:bg-emerald-700');
            saveBtn.classList.add('bg-blue-600', 'hover:bg-blue-700');
            if (!isDocsEditing) saveBtn.classList.add('hidden');
            lucide.createIcons();
          }, 1500);
        } else {
          throw new Error(data.error || 'Failed to save file');
        }
      } catch (err) {
        alert('Failed to save file: ' + err.message);
        saveBtn.innerHTML = '<i data-lucide="save" class="w-3 h-3"></i><span>Save</span>';
        lucide.createIcons();
      } finally {
        saveBtn.disabled = false;
      }
    }

    function setupDocsEditorListeners() {
      const editor = document.getElementById('docs-file-editor');
      if (!editor || editor.__docsListenersReady) return;
      editor.__docsListenersReady = true;

      editor.addEventListener('input', updateEditorCharCount);
      editor.addEventListener('keydown', function(e) {
        if (e.key === 'Tab') {
          e.preventDefault();
          const start = this.selectionStart;
          const end = this.selectionEnd;
          this.value = this.value.substring(0, start) + '  ' + this.value.substring(end);
          this.selectionStart = this.selectionEnd = start + 2;
          updateEditorCharCount();
        }
      });

      document.addEventListener('keydown', function(e) {
        if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
          const ed = document.getElementById('docs-file-editor');
          if (ed && !ed.closest('.hidden')) {
            e.preventDefault();
            saveDocsFileContent();
          }
        }
      });
    }

    function copyDocsFileContent() {
      const content = isDocsEditing
        ? document.getElementById('docs-file-editor')?.value
        : document.getElementById('docs-file-content')?.textContent;
      if (content) {
        navigator.clipboard.writeText(content);
        alert('File content copied to clipboard');
      }
    }

    function copyDocsBasePath() {
      const p = document.getElementById('docs-base-path')?.textContent;
      if (p) {
        navigator.clipboard.writeText(p);
        alert('Copied path: ' + p);
      }
    }

