// Operational dashboard for the existing Modelmaker local backend.
// No sample project data, simulated model runs, or fabricated completion bars.
const byId = id => document.getElementById(id);
const POSITIONS = ['Movement', 'Evolution', 'Being', 'Design'];
let projectState = [], notificationCursor = 0, initialized = false;
let browserAlerts = false, busy = false, refreshTimer = null;

async function api(path, payload) {
  const response = await fetch('/api/computer/' + path, {
    credentials: 'same-origin',
    ...(payload === undefined ? {} : {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
  });
  if (!response.ok) {
    const message = await response.text();
    throw Error(message.slice(0, 1000));
  }
  return response.json();
}
function node(tag, content = '', cls = '') {
  const result = document.createElement(tag);
  if (content !== undefined && content !== null) result.textContent = String(content);
  if (cls) result.className = cls;
  return result;
}
function button(label, action, cls = '') {
  const result = node('button', label, cls);
  result.type = 'button';
  result.onclick = async () => {
    result.disabled = true;
    try {
      await action();
      await reload();
    } catch (err) {
      message(err.message, true);
    } finally {
      result.disabled = false;
    }
  };
  return result;
}
function input(placeholder, value = '') {
  const field = document.createElement('input');
  field.placeholder = placeholder;
  field.value = value;
  field.setAttribute('aria-label', placeholder);
  return field;
}
function select(options, selected = options[0]) {
  const field = document.createElement('select');
  field.setAttribute('aria-label', 'Choose evidence type');
  for (const item of options) {
    const option = node('option', item.label ?? item);
    option.value = item.value ?? item;
    option.selected = option.value === selected;
    field.append(option);
  }
  return field;
}
function message(value, isError = false) {
  const label = byId('team-status');
  label.textContent = value;
  label.classList.toggle('error', isError);
}
function renderTask(task) {
  const card = node('article', '', 'team-task');
  const title = node('h4', task.title);
  const status = node('span', task.state.replaceAll('_',' '), 'team-state');
  const header = node('div', '', 'team-title');
  header.append(title, status);
  card.append(header, node('p', 'Owner: ' + task.owner + ' · Priority ' + task.priority));
  card.append(node('p', 'Done when: ' + task.acceptance));
  if (task.delegate) card.append(node('p', 'Delegated to ' + task.delegate + '. Ownership remains with ' + task.owner + '.'));
  if (task.helpers.length) card.append(node('p', 'Help offered by: ' + task.helpers.join(', ') + ' (not confirmed as running)'));
  if (task.evidence) card.append(node('p', 'Verified receipt: ' + JSON.stringify(task.evidence), 'team-receipt'));
  if (task.state === 'verified') return card;
  const ownerActions = node('div', '', 'team-task-actions');
  ownerActions.append(
    button('Mark working', () => api('team/tasks/' + task.id + '/state',
      {actor: task.owner, state: 'working'})),
    button('Request help', () => api('team/tasks/' + task.id + '/state',
      {actor: task.owner, state: 'help_needed'}))
  );
  card.append(ownerActions);
  const delegateField = input('Outside worker or tool name (record only)');
  const delegateRow = node('div', '', 'team-task-actions');
  delegateRow.append(delegateField, button('Record delegation', async () => {
    if (!delegateField.value.trim()) throw Error('Name a real worker or tool before recording delegation');
    await api('team/tasks/' + task.id + '/delegate', {actor: task.owner, worker: delegateField.value.trim()});
  }));
  card.append(delegateRow);
  const proofType = select([
    {label: 'Verified artifact file', value: 'artifact'},
    {label: 'Complete source-anchored research', value: 'research'}
  ], 'artifact');
  const artifact = input('Path to actual artifact inside your profile workspace');
  const proofRow = node('div', '', 'team-task-actions');
  proofType.onchange = () => {
    artifact.hidden = proofType.value !== 'artifact';
    artifact.required = proofType.value === 'artifact';
  };
  proofRow.append(proofType, artifact, button('Verify task with evidence', async () => {
    const evidence = proofType.value === 'research'
      ? {kind: 'research', dimension: task.owner}
      : {kind: 'artifact', relative_path: artifact.value.trim()};
    await api('team/tasks/' + task.id + '/state',
      {actor: task.owner, state: 'verified', evidence});
  }, 'primary'));
  card.append(proofRow);
  return card;
}
function renderProjects(projects) {
  const view = byId('team-projects');
  view.replaceChildren();
  if (!projects.length) {
    view.append(node('p', 'No projects recorded. Create one above to establish an accountable lead and verification conditions.'));
  }
  for (const p of projects) {
    const article = node('article', '', 'team-project');
    article.id = 'team-project-' + p.id;
    article.append(node('h3', p.title));
    article.append(node('p', 'Lead: ' + p.lead + ' · Status: ' + p.status));
    article.append(node('p', 'Objective: ' + p.objective));
    article.append(node('p', 'Acceptance requirements: ' + p.acceptance));
    const verified = p.tasks.filter(task => task.state === 'verified').length;
    article.append(node('p', verified + ' of ' + p.tasks.length + ' recorded tasks verified. This is not a prediction of completion time.', 'team-receipt'));
    for (const task of p.tasks) article.append(renderTask(task));
    if (p.status === 'active' && p.tasks.length && verified === p.tasks.length) {
      const proofType = select([
        {label:'Final artifact exists',value:'artifact'},
        {label:'Fully anchored research',value:'research'}
      ], 'artifact');
      const proofPath = input('Final artifact path inside your profile workspace');
      const proofRow = node('div', '', 'team-task-actions');
      proofType.onchange = () => {proofPath.hidden = proofType.value !== 'artifact';};
      proofRow.append(proofType, proofPath, button('Submit final delivery evidence', async () => {
        const proof = proofType.value === 'artifact'
          ? {kind: 'artifact', relative_path: proofPath.value.trim()}
          : {kind: 'research', dimension: p.lead};
        await api('team/projects/' + p.id + '/deliver', {actor:p.lead, proof});
      }, 'primary'));
      article.append(proofRow);
    }
    if (p.status === 'awaiting_acceptance') {
      const review = node('div', '', 'team-task');
      review.append(node('p', 'Delivery evidence is ready for your review. This is not a claim of successful runtime or Android installation.'));
      review.append(node('p', 'Recorded final evidence: ' + JSON.stringify(p.proof), 'team-receipt'));
      review.append(button('I reviewed and accept this delivery', async () => {
        if (!window.confirm('Only accept after independently inspecting the actual deliverable against your project requirements. Approve this project?')) return;
        await api('team/projects/' + p.id + '/accept', {approved: true});
      }, 'primary'));
      article.append(review);
    }
    view.append(article);
  }
  const options = byId('team-task-project');
  const selected = options.value;
  options.replaceChildren();
  for (const project of projects.filter(p => p.status === 'active')) {
    const option = node('option', project.title);
    option.value = project.id;
    options.append(option);
  }
  if (projects.some(p => p.id === selected && p.status === 'active')) options.value = selected;
  const canAssign = Boolean(options.options.length);
  const submit = byId('team-task-form').querySelector('button[type=submit],button:not([type])');
  submit.disabled = !canAssign;
  if (!canAssign) {
    const option = node('option', 'Create a project first');
    option.value = '';
    options.append(option);
  }
}
function renderFeed(notices, unread) {
  const target = byId('team-notifications');
  target.replaceChildren();
  if (!notices.length) target.append(node('p','No actual notifications yet.'));
  for (const event of [...notices].reverse()) {
    const item = node('article', '', 'team-event');
    const when = event.created.replace('T',' ').slice(0,19) + ' UTC';
    item.append(node('strong', event.title));
    item.append(node('p', event.detail));
    item.append(node('small', when + (event.acknowledged ? ' · Read' : ' · Unread')));
    target.append(item);
  }
  byId('team-unread').textContent = unread + ' unread';
  byId('team-bell-count').textContent = unread > 0 ? ' (' + unread + ')' : '';
}
let notificationRegistration = null;
async function getNotificationRegistration() {
  if (!('serviceWorker' in navigator)) return null;
  if (!notificationRegistration) {
    notificationRegistration = await navigator.serviceWorker.register(
      '/computer/team_notifications_sw.js', {scope: '/'});
  }
  return notificationRegistration;
}
async function notifyNewEvents(fresh) {
  if (!browserAlerts || !('Notification' in window) || Notification.permission !== 'granted') return;
  for (const event of fresh) {
    if (event.kind === 'assignment' || event.kind === 'delegation') continue;
    try {
      const title = 'Modelmaker: ' + event.title;
      const options = {body:event.detail, tag:'modelmaker-team-' + event.id,
        data:{projectId:event.project_id ?? null}};
      const service = await getNotificationRegistration();
      if (service) {
        // Android Chromium requires registration.showNotification, not new Notification().
        await service.showNotification(title, options);
      } else {
        const notice = new Notification(title, options);
        notice.onclick = () => {window.location.href = '/?team=1' +
          (event.project_id ? '&project_id=' + encodeURIComponent(event.project_id) : ''); notice.close();};
      }
    } catch (error) {
      message('Notification saved to inbox, but OS alert could not display: ' + error.message, true);
    }
  }
}
async function reload() {
  if (busy) return;
  busy = true;
  try {
    const [state, history] = await Promise.all([
      api('team/state'), api('team/notifications?after=0&limit=100')
    ]);
    projectState = state.projects;
    renderProjects(projectState);
    renderFeed(history.notifications, state.unread);
    const recent = await api('team/notifications?after=' + notificationCursor + '&limit=100');
    if (initialized) await notifyNewEvents(recent.notifications);
    notificationCursor = recent.latest;
    initialized = true;
    const target = new URLSearchParams(window.location.search).get('project_id');
    const section = target ? byId('team-project-' + target) : null;
    if (section && !byId('team-board').hidden) section.scrollIntoView({block:'start',behavior:'smooth'});
    message('Synced with local Modelmaker. Worker execution: ' + state.worker_execution.replaceAll('_', ' ') + '.');
  } catch (err) {
    message('Not connected: ' + err.message, true);
  } finally {
    busy = false;
  }
}

byId('team-project-form').onsubmit = async e => {
  e.preventDefault();
  const action = e.submitter;
  action.disabled = true;
  try {
    await api('team/projects', {
      title: byId('team-project-title').value,
      objective: byId('team-project-objective').value,
      acceptance: byId('team-project-acceptance').value,
      lead: byId('team-project-lead').value
    });
    e.target.reset();
    await reload();
  } catch (err) { message(err.message, true); }
  finally {action.disabled = false;}
};
byId('team-task-form').onsubmit = async e => {
  e.preventDefault();
  const action = e.submitter;
  action.disabled = true;
  try {
    await api('team/tasks', {
      project_id: byId('team-task-project').value,
      title: byId('team-task-title').value,
      acceptance: byId('team-task-acceptance').value,
      owner: byId('team-task-owner').value,
      priority: Number(byId('team-task-priority').value)
    });
    byId('team-task-title').value = '';
    byId('team-task-acceptance').value = '';
    await reload();
  } catch (err) {message(err.message, true);}
  finally {action.disabled = false;}
};
byId('team-enable-notifications').onclick = async () => {
  if (!('Notification' in window)) {
    message('This browser does not support device notifications.', true);
    return;
  }
  const permission = await Notification.requestPermission();
  browserAlerts = permission === 'granted';
  if (browserAlerts) {try {await getNotificationRegistration();} catch (err) {message('Notifications permission granted; service-worker registration failed: ' + err.message, true);}}
  message(browserAlerts
    ? 'Notifications enabled while this workspace stays open. Android background alerts require a native bridge.'
    : 'Notification permission not granted. All events remain in the local notification inbox.',
    !browserAlerts);
};
byId('team-refresh').onclick = reload;
byId('team-ack').onclick = async () => {
  try {
    await api('team/notifications/ack',{through_id:notificationCursor});
    await reload();
  } catch (err) {message(err.message, true);}
};
window.addEventListener('modelmaker-team-open', reload);
document.addEventListener('visibilitychange',() => {if (!document.hidden) reload();});
refreshTimer = window.setInterval(reload, 8000);
if (new URLSearchParams(window.location.search).get('team') === '1') {
  byId('team-board-tab').click();
} else {
  reload();
}
