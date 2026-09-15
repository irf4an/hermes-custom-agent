const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const CONFIG_PATH = path.join(__dirname, 'channels_config.json');

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('Error loading channels_config.json:', err.message);
  }
  return {
    enabled: true,
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    chatId: process.env.TELEGRAM_CHAT_ID || '',
    topics: {
      server_status: '',
      agent_execution: '',
      system_alerts: '',
      agent_bindings: {}
    },
    autoNotify: {
      onTaskStart: true,
      onTaskComplete: true,
      onTaskBlock: true,
      onServerAlert: true,
      serverHealthDigest: false
    },
    history: []
  };
}

function saveConfig(config) {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Error saving channels_config.json:', err.message);
    return false;
  }
}

function appendHistory(event) {
  try {
    const config = loadConfig();
    if (!config.history) config.history = [];
    config.history.unshift({
      id: Date.now().toString(36) + Math.random().toString(36).substr(2, 4),
      timestamp: new Date().toISOString(),
      ...event
    });
    if (config.history.length > 50) {
      config.history = config.history.slice(0, 50);
    }
    saveConfig(config);
  } catch (e) {
    console.error('Failed to log history:', e.message);
  }
}

function getEffectiveToken(tokenOverride) {
  if (tokenOverride && tokenOverride.trim()) return tokenOverride.trim();
  const config = loadConfig();
  if (config.botToken && config.botToken.trim()) return config.botToken.trim();
  if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_BOT_TOKEN.trim()) {
    return process.env.TELEGRAM_BOT_TOKEN.trim();
  }
  try {
    const defaultEnvPath = path.join(process.env.HOME || '/root', '.hermes', '.env');
    if (fs.existsSync(defaultEnvPath)) {
      const content = fs.readFileSync(defaultEnvPath, 'utf8');
      const match = content.match(/^TELEGRAM_BOT_TOKEN=(.+)$/m);
      if (match && match[1].trim()) return match[1].trim();
    }
  } catch (e) {}
  return '';
}

function makeTelegramRequest(method, payload, tokenOverride) {
  return new Promise((resolve, reject) => {
    const token = getEffectiveToken(tokenOverride);
    if (!token) {
      return reject(new Error('TELEGRAM_BOT_TOKEN is not configured'));
    }

    const postData = JSON.stringify(payload);
    const options = {
      hostname: 'api.telegram.org',
      port: 443,
      path: `/bot${token}/${method}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 10000
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (parsed.ok) {
            resolve(parsed.result);
          } else {
            reject(new Error(parsed.description || `Telegram API Error (${parsed.error_code})`));
          }
        } catch (e) {
          reject(new Error(`Failed to parse response: ${body.substring(0, 100)}`));
        }
      });
    });

    req.on('error', (err) => reject(err));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Telegram API request timed out (10s)'));
    });

    req.write(postData);
    req.end();
  });
}

async function verifyBot(token) {
  try {
    const res = await makeTelegramRequest('getMe', {}, token);
    return { success: true, bot: res };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function sendMessage({ text, chatId, topicId, parseMode = 'HTML', token }) {
  const config = loadConfig();
  const targetChatId = chatId || config.chatId;
  if (!targetChatId) {
    throw new Error('No target Chat ID provided or configured');
  }

  const payload = {
    chat_id: targetChatId,
    text: text,
    parse_mode: parseMode,
    disable_web_page_preview: true
  };

  if (topicId) {
    const parsedTopic = parseInt(topicId, 10);
    if (!isNaN(parsedTopic) && parsedTopic > 0) {
      payload.message_thread_id = parsedTopic;
    }
  }

  try {
    const result = await makeTelegramRequest('sendMessage', payload, token);
    appendHistory({
      type: 'message',
      target: targetChatId,
      topicId: topicId || 'General',
      status: 'success',
      snippet: text.replace(/<[^>]*>?/gm, '').substring(0, 100)
    });
    return { success: true, result };
  } catch (err) {
    appendHistory({
      type: 'message',
      target: targetChatId,
      topicId: topicId || 'General',
      status: 'error',
      snippet: text.replace(/<[^>]*>?/gm, '').substring(0, 100),
      error: err.message
    });
    throw err;
  }
}

function getServerTelemetry() {
  try {
    const memRaw = execSync('free -m', { encoding: 'utf8' });
    const lines = memRaw.trim().split('\n');
    const memParts = lines[1].split(/\s+/);
    const swapParts = lines.length > 2 ? lines[2].split(/\s+/) : ['Swap:', '0', '0', '0'];

    const totalMem = parseInt(memParts[1], 10);
    const usedMem = parseInt(memParts[2], 10);
    const totalSwap = parseInt(swapParts[1] || 0, 10);
    const usedSwap = parseInt(swapParts[2] || 0, 10);

    const dfRaw = execSync('df -h /', { encoding: 'utf8' });
    const dfLines = dfRaw.trim().split('\n');
    const dfParts = dfLines[1].split(/\s+/);

    let pm2List = [];
    try {
      const pm2Raw = execSync('pm2 jlist', { encoding: 'utf8' });
      const pm2Parsed = JSON.parse(pm2Raw);
      pm2List = pm2Parsed.map(p => ({
        name: p.name,
        status: p.pm2_env.status,
        cpu: p.monit ? p.monit.cpu : 0,
        mem: p.monit ? `${Math.round(p.monit.memory / 1024 / 1024)}MB` : '0MB'
      }));
    } catch (e) {}

    const uptime = execSync('uptime -p', { encoding: 'utf8' }).trim();
    const loadAvg = execSync("uptime | awk -F'load average:' '{ print $2 }'", { encoding: 'utf8' }).trim();

    return {
      ram: { total: totalMem, used: usedMem, pct: Math.round((usedMem / totalMem) * 100) },
      swap: { total: totalSwap, used: usedSwap, pct: totalSwap > 0 ? Math.round((usedSwap / totalSwap) * 100) : 0 },
      disk: { total: dfParts[1], used: dfParts[2], avail: dfParts[3], pct: dfParts[4] },
      uptime,
      loadAvg,
      pm2: pm2List
    };
  } catch (err) {
    return null;
  }
}

async function sendServerStatusNotification(customTopicId) {
  const config = loadConfig();
  const topicId = customTopicId || config.topics.server_status || null;
  const stats = getServerTelemetry();
  if (!stats) throw new Error('Failed to collect server telemetry');

  let pm2Text = '';
  if (stats.pm2 && stats.pm2.length > 0) {
    pm2Text = stats.pm2.map(p => {
      const icon = p.status === 'online' ? '🟢' : '🔴';
      return `  ${icon} <code>${p.name}</code> (${p.status}, CPU ${p.cpu}%, Mem ${p.mem})`;
    }).join('\n');
  } else {
    pm2Text = '  <i>No PM2 processes active</i>';
  }

  const msg = [
    `🖥️ <b>VPS Telemetry & System Status</b>`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `⚡ <b>Load Average:</b> <code>${stats.loadAvg}</code>`,
    `⏱️ <b>Uptime:</b> <code>${stats.uptime}</code>`,
    `📊 <b>RAM Usage:</b> <code>${stats.ram.used}MB / ${stats.ram.total}MB (${stats.ram.pct}%)</code>`,
    `🔄 <b>Swap Usage:</b> <code>${stats.swap.used}MB / ${stats.swap.total}MB (${stats.swap.pct}%)</code>`,
    `💾 <b>Disk Usage (/):</b> <code>${stats.disk.used} / ${stats.disk.total} (${stats.disk.pct})</code>`,
    ``,
    `🚀 <b>Active Services:</b>`,
    pm2Text,
    ``,
    `🕒 <i>${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB</i>`
  ].join('\n');

  return await sendMessage({
    text: msg,
    topicId: topicId,
    chatId: config.chatId
  });
}

async function sendTaskNotification(event, task, details = {}) {
  const config = loadConfig();
  if (!config.enabled) return { skipped: true, reason: 'Notifications disabled' };

  let allow = false;
  let eventIcon = '📋';
  let eventTitle = 'Task Update';

  switch (event) {
    case 'created':
      allow = config.autoNotify.onTaskStart;
      eventIcon = '✨';
      eventTitle = 'New Task Created';
      break;
    case 'started':
    case 'running':
      allow = config.autoNotify.onTaskStart;
      eventIcon = '🚀';
      eventTitle = 'Agent Execution Started';
      break;
    case 'completed':
    case 'done':
      allow = config.autoNotify.onTaskComplete;
      eventIcon = '✅';
      eventTitle = 'Task Execution Completed';
      break;
    case 'blocked':
      allow = config.autoNotify.onTaskBlock;
      eventIcon = '🛑';
      eventTitle = 'Task Blocked / Needs Input';
      break;
    case 'failed':
      allow = true;
      eventIcon = '💥';
      eventTitle = 'Task Execution Failed';
      break;
    default:
      allow = true;
      eventTitle = `Task Event: ${event}`;
  }

  if (!allow) return { skipped: true, reason: `Event ${event} disabled in autoNotify` };

  // Topic resolution: check agent-specific binding first, then general agent_execution topic
  let topicId = null;
  const assignee = (task.assignee || 'default').toLowerCase();
  if (config.topics.agent_bindings && config.topics.agent_bindings[assignee]) {
    topicId = config.topics.agent_bindings[assignee];
  } else {
    topicId = config.topics.agent_execution || null;
  }

  const msg = [
    `${eventIcon} <b>${eventTitle}</b>`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `📌 <b>Title:</b> <code>${task.title || 'Untitled Task'}</code>`,
    `🆔 <b>ID:</b> <code>${task.id || 'N/A'}</code>`,
    `👤 <b>Assignee:</b> <b>${task.assignee ? task.assignee.toUpperCase() : 'DEFAULT'}</b>`,
    `🏷️ <b>Priority:</b> <code>${task.priority !== undefined ? task.priority : 0}</code>`,
    task.body ? `📝 <b>Description:</b> <i>${task.body.substring(0, 300)}</i>` : '',
    details.summary ? `\n💡 <b>Result / Summary:</b>\n${details.summary}` : '',
    details.reason ? `\n⚠️ <b>Block Reason:</b>\n<code>${details.reason}</code>` : '',
    details.error ? `\n❌ <b>Error:</b>\n<code>${details.error}</code>` : '',
    ``,
    `🕒 <i>${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB</i>`
  ].filter(Boolean).join('\n');

  return await sendMessage({
    text: msg,
    topicId: topicId,
    chatId: config.chatId
  });
}

async function sendSystemAlertNotification(title, message, severity = 'WARNING', customTopicId) {
  const config = loadConfig();
  const topicId = customTopicId || config.topics.system_alerts || null;
  
  const icon = severity === 'CRITICAL' ? '🚨' : (severity === 'WARNING' ? '⚠️' : 'ℹ️');

  const msg = [
    `${icon} <b>SYSTEM ALERT [${severity}]</b>`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `⚡ <b>Alert:</b> <b>${title}</b>`,
    `📋 <b>Details:</b>`,
    `<code>${message}</code>`,
    ``,
    `🕒 <i>${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB</i>`
  ].join('\n');

  return await sendMessage({
    text: msg,
    topicId: topicId,
    chatId: config.chatId
  });
}

// Background watchdog check: monitors high RAM / CPU / PM2 failure
function runWatchdogCheck() {
  try {
    const config = loadConfig();
    if (!config.enabled || !config.autoNotify || !config.autoNotify.onServerAlert) return;

    const stats = getServerTelemetry();
    if (!stats) return;

    if (stats.ram.pct >= 90) {
      sendSystemAlertNotification(
        'High RAM Usage Warning',
        `RAM usage reached ${stats.ram.pct}% (${stats.ram.used}MB / ${stats.ram.total}MB). Swap: ${stats.swap.pct}%.`,
        'WARNING'
      ).catch(e => console.error('Watchdog notify error:', e.message));
    }

    if (stats.pm2) {
      stats.pm2.forEach(p => {
        if (p.status !== 'online') {
          sendSystemAlertNotification(
            `PM2 Process Down: ${p.name}`,
            `Service ${p.name} status is currently ${p.status.toUpperCase()}.`,
            'CRITICAL'
          ).catch(e => console.error('Watchdog notify error:', e.message));
        }
      });
    }
  } catch (err) {
    console.error('Error running watchdog check:', err.message);
  }
}

module.exports = {
  loadConfig,
  saveConfig,
  getEffectiveToken,
  verifyBot,
  sendMessage,
  getServerTelemetry,
  sendServerStatusNotification,
  sendTaskNotification,
  sendSystemAlertNotification,
  runWatchdogCheck
};

// CLI execution handler
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';

  (async () => {
    try {
      if (command === 'verify') {
        const res = await verifyBot(args[1]);
        console.log(JSON.stringify(res, null, 2));
      } else if (command === 'status') {
        const res = await sendServerStatusNotification(args[1]);
        console.log('Status sent:', res);
      } else if (command === 'alert') {
        const res = await sendSystemAlertNotification(args[1] || 'Manual Alert', args[2] || 'Test alert body', args[3] || 'INFO', args[4]);
        console.log('Alert sent:', res);
      } else if (command === 'message') {
        const res = await sendMessage({ text: args[1] || 'Test message', topicId: args[2], chatId: args[3] });
        console.log('Message sent:', res);
      } else if (command === 'telemetry') {
        console.log(JSON.stringify(getServerTelemetry(), null, 2));
      } else {
        console.log('Usage: node telegram_notifier.js [verify <token> | status [topicId] | alert <title> <msg> [severity] [topicId] | message <text> [topicId] [chatId] | telemetry]');
      }
    } catch (err) {
      console.error('Execution failed:', err.message);
      process.exit(1);
    }
  })();
}
