const $ = (id) => document.getElementById(id);
const STORAGE_KEY = 'personal_assistant_items_v1';

let items = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
let timerInterval = null;
let timeLeft = 25 * 60;
let remindersInterval = null;

function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2); }
function save(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); }
function parseDate(value){ return value ? new Date(value) : null; }
function isSameDay(a,b){ return a && b && a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate(); }
function formatDateTime(value){
  if(!value) return 'No date';
  const d = parseDate(value);
  if(isNaN(d)) return 'Invalid date';
  return d.toLocaleString([], { weekday:'short', year:'numeric', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
}
function dateStatus(value, done=false){
  const d = parseDate(value); if(!d || isNaN(d)) return '';
  const now = new Date();
  if(done) return 'Done';
  if(d < now) return 'Overdue';
  if(isSameDay(d, now)) return 'Today';
  return 'Upcoming';
}
function sortedItems(list){ return [...list].sort((a,b)=> new Date(a.date || 0) - new Date(b.date || 0)); }
function escapeHtml(str=''){
  return str.replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}

function setDefaultDates(){
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  const value = now.toISOString().slice(0,16);
  $('taskDate').value = value;
  $('apptDate').value = value;
}

function render(){
  const today = new Date();
  $('todayName').textContent = today.toLocaleDateString([], { weekday:'long' });
  $('todayDate').textContent = today.toLocaleDateString([], { day:'2-digit', month:'short', year:'numeric' });

  const tasks = items.filter(i=>i.type==='task');
  const appts = items.filter(i=>i.type==='appointment');
  const done = items.filter(i=>i.done).length;
  const todayCount = items.filter(i=> isSameDay(parseDate(i.date), today)).length;
  const overdue = items.filter(i=> !i.done && parseDate(i.date) && parseDate(i.date) < today).length;
  $('statTotal').textContent = items.length;
  $('statToday').textContent = todayCount;
  $('statOverdue').textContent = overdue;
  $('statDone').textContent = done;

  const filter = $('filterStatus').value;
  const filteredTasks = tasks.filter(t => filter === 'all' || (filter === 'done' ? t.done : !t.done));
  renderList('taskList', sortedItems(filteredTasks), true);
  renderList('appointmentList', sortedItems(appts), false);

  const todayItems = sortedItems(items.filter(i => isSameDay(parseDate(i.date), today)));
  renderList('todayAgenda', todayItems, true, 'No items for today.');

  const upcoming = sortedItems(items.filter(i => !i.done && parseDate(i.date) && parseDate(i.date) >= today)).slice(0,5);
  renderList('upcomingList', upcoming, true, 'No upcoming reminders.');
}

function renderList(targetId, list, allowDone=true, emptyText='No data yet.'){
  const el = $(targetId);
  if(!list.length){ el.className='list empty-state'; el.innerHTML = emptyText; return; }
  el.className='list';
  el.innerHTML = list.map(item => {
    const status = dateStatus(item.date, item.done);
    const priorityClass = item.priority === 'Urgent' ? 'urgent' : item.priority === 'Low' ? 'low' : '';
    const overdueClass = status === 'Overdue' ? 'overdue' : '';
    return `<article class="item ${item.done ? 'done':''}">
      <div class="item-head">
        <div>
          <div class="item-title">${item.type==='appointment' ? '📅' : '✅'} ${escapeHtml(item.title)}</div>
          <div class="item-meta">
            <span>${formatDateTime(item.date)}</span>
            ${item.location ? `<span>📍 ${escapeHtml(item.location)}</span>` : ''}
            ${item.reminder ? `<span>🔔 ${item.reminder} min before</span>` : ''}
          </div>
        </div>
        <span class="badge ${priorityClass} ${overdueClass}">${item.type==='task' ? item.priority : status}</span>
      </div>
      ${item.note ? `<div class="item-meta">${escapeHtml(item.note)}</div>` : ''}
      <div class="item-actions">
        ${allowDone && item.type==='task' ? `<button class="secondary" onclick="toggleDone('${item.id}')">${item.done ? 'Undo' : 'Done'}</button>` : ''}
        <button class="danger" onclick="deleteItem('${item.id}')">Delete</button>
      </div>
    </article>`;
  }).join('');
}

function addTask(e){
  e.preventDefault();
  const title = $('taskTitle').value.trim();
  const date = $('taskDate').value;
  if(!title || !date) return alert('Please enter task title and date.');
  items.push({ id:uid(), type:'task', title, priority:$('taskPriority').value, date, note:$('taskNote').value.trim(), done:false });
  save(); e.target.reset(); setDefaultDates(); render();
}

function addAppointment(e){
  e.preventDefault();
  const title = $('apptTitle').value.trim();
  const date = $('apptDate').value;
  if(!title || !date) return alert('Please enter rendez-vous title and date.');
  items.push({ id:uid(), type:'appointment', title, location:$('apptLocation').value.trim(), date, reminder:Number($('apptReminder').value), note:$('apptNote').value.trim(), done:false, notified:false });
  save(); e.target.reset(); setDefaultDates(); render();
}

window.toggleDone = function(id){ const item = items.find(i=>i.id===id); if(item){ item.done = !item.done; save(); render(); } };
window.deleteItem = function(id){ items = items.filter(i=>i.id!==id); save(); render(); };

function switchTab(tab){
  document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active', b.dataset.tab===tab));
  document.querySelectorAll('.panel').forEach(p=>p.classList.toggle('active-panel', p.id===tab));
}

function notify(title, body){
  if('Notification' in window && Notification.permission === 'granted') new Notification(title, { body, icon:'icons/icon-192.png' });
  else alert(`${title}\n${body}`);
}

async function enableNotifications(){
  if(!('Notification' in window)) return alert('Notifications are not supported on this browser.');
  const permission = await Notification.requestPermission();
  alert(permission === 'granted' ? 'Reminders enabled ✅' : 'Notifications not allowed.');
}

function checkReminders(){
  const now = new Date();
  items.forEach(item => {
    if(item.done || item.notified || !item.date) return;
    const d = parseDate(item.date); if(!d || isNaN(d)) return;
    const reminderMin = item.type === 'appointment' ? Number(item.reminder || 0) : 0;
    const reminderTime = new Date(d.getTime() - reminderMin * 60000);
    if(now >= reminderTime && now <= new Date(reminderTime.getTime() + 60000)){
      notify(item.type === 'appointment' ? 'Rendez-vous reminder' : 'Task reminder', `${item.title} — ${formatDateTime(item.date)}`);
      item.notified = true; save(); render();
    }
  });
}

function updateTimer(){
  const m = Math.floor(timeLeft/60).toString().padStart(2,'0');
  const s = (timeLeft%60).toString().padStart(2,'0');
  $('timer').textContent = `${m}:${s}`;
}
function startTimer(){
  clearInterval(timerInterval);
  timerInterval = setInterval(()=>{
    if(timeLeft <= 0){ clearInterval(timerInterval); notify('Focus completed', 'Good job! Take a 5 min break.'); timeLeft = 5*60; updateTimer(); return; }
    timeLeft--; updateTimer();
  },1000);
}
function pauseTimer(){ clearInterval(timerInterval); }
function resetTimer(){ clearInterval(timerInterval); timeLeft = 25*60; updateTimer(); }

$('taskForm').addEventListener('submit', addTask);
$('appointmentForm').addEventListener('submit', addAppointment);
$('filterStatus').addEventListener('change', render);
$('notifyBtn').addEventListener('click', enableNotifications);
$('startTimer').addEventListener('click', startTimer);
$('pauseTimer').addEventListener('click', pauseTimer);
$('resetTimer').addEventListener('click', resetTimer);
document.querySelectorAll('.tab').forEach(btn=>btn.addEventListener('click',()=>switchTab(btn.dataset.tab)));

setDefaultDates();
render();
checkReminders();
remindersInterval = setInterval(checkReminders, 30000);

if('serviceWorker' in navigator){
  window.addEventListener('load', ()=> navigator.serviceWorker.register('./service-worker.js').catch(console.error));
}
