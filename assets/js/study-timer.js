// assets/js/study-timer.js
// Study session timer with Pomodoro mode

const THEME_KEY = "pharmlet.theme";
const SESSIONS_KEY = "pharmlet.sessions";
const SETTINGS_KEY = "pharmlet.timer-settings";

const state = {
  mode: "session", // "session" or "pomodoro"
  running: false,
  seconds: 0,
  pomodoroPhase: "work", // "work" or "break"
  pomodoroCount: 0,
  intervalId: null,
  sessionStart: null
};

const POMODORO_WORK = 25 * 60; // 25 minutes
const POMODORO_BREAK = 5 * 60; // 5 minutes

document.addEventListener("DOMContentLoaded", () => {
  // Theme toggle
  const themeToggle = document.getElementById("theme-toggle");
  const themeLabel = document.getElementById("theme-label");
  
  if (themeToggle && themeLabel) {
    const saved = localStorage.getItem(THEME_KEY);
    const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches;
    const start = saved || (prefersDark ? "dark" : "light");
    document.documentElement.classList.toggle("dark", start === "dark");
    themeLabel.textContent = start === "dark" ? "Light" : "Dark";
    
    themeToggle.addEventListener("click", () => {
      const next = document.documentElement.classList.contains("dark") ? "light" : "dark";
      document.documentElement.classList.toggle("dark", next === "dark");
      localStorage.setItem(THEME_KEY, next);
      themeLabel.textContent = next === "dark" ? "Light" : "Dark";
    });
  }

  // Event listeners
  document.getElementById("mode-session")?.addEventListener("click", () => switchMode("session"));
  document.getElementById("mode-pomodoro")?.addEventListener("click", () => switchMode("pomodoro"));
  document.getElementById("start-timer")?.addEventListener("click", startTimer);
  document.getElementById("pause-timer")?.addEventListener("click", pauseTimer);
  document.getElementById("reset-timer")?.addEventListener("click", resetTimer);
  document.getElementById("clear-sessions")?.addEventListener("click", clearSessions);

  loadStats();
  updateDisplay();
});

function switchMode(mode) {
  if (state.running) {
    if (!confirm("Switch timer mode? Current session will be reset.")) return;
    pauseTimer();
  }
  
  state.mode = mode;
  state.seconds = mode === "pomodoro" ? POMODORO_WORK : 0;
  state.pomodoroPhase = "work";
  
  document.getElementById("mode-session").classList.toggle("btn-blue", mode === "session");
  document.getElementById("mode-session").classList.toggle("btn-ghost", mode !== "session");
  document.getElementById("mode-pomodoro").classList.toggle("btn-blue", mode === "pomodoro");
  document.getElementById("mode-pomodoro").classList.toggle("btn-ghost", mode !== "pomodoro");
  document.getElementById("pomodoro-status").classList.toggle("hidden", mode !== "pomodoro");
  
  updateDisplay();
}

function startTimer() {
  if (state.running) return;
  
  state.running = true;
  state.sessionStart = state.sessionStart || new Date();
  
  document.getElementById("start-timer").classList.add("hidden");
  document.getElementById("pause-timer").classList.remove("hidden");
  
  state.intervalId = setInterval(() => {
    if (state.mode === "session") {
      state.seconds++;
    } else {
      state.seconds--;
      if (state.seconds <= 0) {
        completePomodoro();
      }
    }
    updateDisplay();
  }, 1000);
}

function pauseTimer() {
  if (!state.running) return;
  
  state.running = false;
  clearInterval(state.intervalId);
  
  document.getElementById("start-timer").classList.remove("hidden");
  document.getElementById("pause-timer").classList.add("hidden");
  
  // Save session if in session mode and time > 1 minute
  if (state.mode === "session" && state.seconds >= 60) {
    saveSession(state.seconds);
  }
}

function resetTimer() {
  if (state.running) {
    pauseTimer();
  }
  
  state.seconds = state.mode === "pomodoro" ? POMODORO_WORK : 0;
  state.sessionStart = null;
  updateDisplay();
}

function completePomodoro() {
  clearInterval(state.intervalId);
  state.running = false;
  
  if (state.pomodoroPhase === "work") {
    state.pomodoroCount++;
    state.pomodoroPhase = "break";
    state.seconds = POMODORO_BREAK;
    
    // Save work session
    saveSession(POMODORO_WORK);
    
    if (Notification?.permission === "granted") {
      new Notification("Pomodoro Complete!", { body: "Time for a 5-minute break!" });
    } else {
      alert("🎉 Pomodoro complete! Take a 5-minute break.");
    }
  } else {
    state.pomodoroPhase = "work";
    state.seconds = POMODORO_WORK;
    
    if (Notification?.permission === "granted") {
      new Notification("Break Complete!", { body: "Ready for another work session?" });
    } else {
      alert("✅ Break complete! Ready for the next session?");
    }
  }
  
  document.getElementById("start-timer").classList.remove("hidden");
  document.getElementById("pause-timer").classList.add("hidden");
  updateDisplay();
  loadStats();
}

function updateDisplay() {
  const mins = Math.floor(state.seconds / 60);
  const secs = state.seconds % 60;
  const display = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  
  document.getElementById("timer-display").textContent = display;
  
  // Update progress ring
  if (state.mode === "pomodoro") {
    const total = state.pomodoroPhase === "work" ? POMODORO_WORK : POMODORO_BREAK;
    const progress = 1 - (state.seconds / total);
    const circumference = 2 * Math.PI * 138; // radius = 138
    const offset = circumference * (1 - progress);
    document.getElementById("progress-ring-fill").style.strokeDashoffset = offset;
  } else {
    document.getElementById("progress-ring-fill").style.strokeDashoffset = 0;
  }
  
  // Update Pomodoro status
  if (state.mode === "pomodoro") {
    const phase = state.pomodoroPhase === "work" ? "Work Session" : "Break Time";
    const status = `${phase} • ${state.pomodoroCount} completed today`;
    document.getElementById("pomodoro-status").textContent = status;
  }
}

function saveSession(seconds) {
  try {
    const sessions = JSON.parse(localStorage.getItem(SESSIONS_KEY) || "[]");
    sessions.push({
      duration: seconds,
      timestamp: new Date().toISOString(),
      mode: state.mode
    });
    
    // Keep last 100 sessions
    if (sessions.length > 100) sessions.shift();
    
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
    state.sessionStart = null;
    loadStats();
  } catch {}
}

function loadStats() {
  try {
    const sessions = JSON.parse(localStorage.getItem(SESSIONS_KEY) || "[]");
    
    // Calculate today's time
    const today = new Date().toDateString();
    const todaySessions = sessions.filter(s => new Date(s.timestamp).toDateString() === today);
    const todayMinutes = todaySessions.reduce((sum, s) => sum + s.duration, 0) / 60;
    
    // Calculate this week's time
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);
    const weekSessions = sessions.filter(s => new Date(s.timestamp) >= weekStart);
    const weekMinutes = weekSessions.reduce((sum, s) => sum + s.duration, 0) / 60;
    
    // Update display
    document.getElementById("today-time").textContent = formatMinutes(todayMinutes);
    document.getElementById("week-time").textContent = formatMinutes(weekMinutes);
    document.getElementById("total-sessions").textContent = sessions.length;
    
    // Update pomodoro count for today
    const todayPomodoros = todaySessions.filter(s => s.mode === "pomodoro" && s.duration >= POMODORO_WORK - 60).length;
    state.pomodoroCount = todayPomodoros;
    
    // Show recent sessions
    const recentContainer = document.getElementById("recent-sessions");
    if (sessions.length === 0) {
      recentContainer.innerHTML = '<p style="color:var(--muted)">No sessions yet. Start your first study session!</p>';
    } else {
      recentContainer.innerHTML = "";
      sessions.slice(-10).reverse().forEach(session => {
        const div = document.createElement("div");
        div.className = "flex justify-between items-center";
        const date = new Date(session.timestamp);
        const timeAgo = getTimeAgo(date);
        const duration = formatMinutes(session.duration / 60);
        
        div.innerHTML = `
          <div>
            <span class="font-semibold">${duration}</span>
            <span class="text-sm" style="color:var(--muted)"> • ${session.mode === "pomodoro" ? "Pomodoro" : "Free study"}</span>
          </div>
          <span class="text-sm" style="color:var(--muted)">${timeAgo}</span>
        `;
        recentContainer.appendChild(div);
      });
    }
  } catch {}
}

function clearSessions() {
  if (confirm("Clear all session data? This cannot be undone.")) {
    localStorage.removeItem(SESSIONS_KEY);
    state.pomodoroCount = 0;
    loadStats();
  }
}

function formatMinutes(mins) {
  const hours = Math.floor(mins / 60);
  const minutes = Math.floor(mins % 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function getTimeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  const intervals = {
    day: 86400,
    hour: 3600,
    minute: 60
  };
  
  for (const [unit, secondsInUnit] of Object.entries(intervals)) {
    const interval = Math.floor(seconds / secondsInUnit);
    if (interval >= 1) {
      return `${interval} ${unit}${interval === 1 ? '' : 's'} ago`;
    }
  }
  return 'just now';
}
