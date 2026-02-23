// script.js — Dynamic library with HLS-first, PiP, Seek, Auto-Season & Sleep Timer

// ------------------------------------------------------------------
// Auto-detect the correct local IP to prevent router blocking
const BACKEND_URL = window.location.protocol === "file:" ? "http://127.0.0.1:8000" : window.location.origin;
// ------------------------------------------------------------------

const MANIFEST_URL = `${BACKEND_URL}/hls/movies.json`; 
const LS_KEY = "axy_v2_progress"; 

let manifest = null;
let currentSeries = null;
let currentSeason = null;
let currentIndex = 0;
let sleepTimerId = null;

const library = document.getElementById("library");
const video = document.getElementById("video-player");
const prevBtn = document.getElementById("prev-btn");
const nextBtn = document.getElementById("next-btn");
const popoutBtn = document.getElementById("popout-btn");
const nowPlayingDiv = document.getElementById("now-playing");

// Controls
const playPauseBtn = document.getElementById("play-pause-btn");
const seekBackBtn = document.getElementById("seek-back");
const seekFwdBtn = document.getElementById("seek-fwd");
const sleepTimerSelect = document.getElementById("sleep-timer");

// Modal Elements
const resumeModal = document.getElementById("resume-modal");
const resumeText = document.getElementById("resume-text");
const resumeYes = document.getElementById("resume-yes");
const resumeNo = document.getElementById("resume-no");

// -------------------------------
// Load manifest.json
// -------------------------------
async function loadManifest() {
  try {
    const res = await fetch(MANIFEST_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    manifest = await res.json();
    buildLibrary();
    checkForResume();
  } catch (err) {
    console.error("Manifest load failed:", err);
    library.innerHTML = `<div style="text-align:center; padding:20px; color:red">
      <h3>Cannot connect to Backend</h3>
      <p>Make sure your local server is running and check Developer Tools (F12) for exact errors.</p>
    </div>`;
  }
}

// -------------------------------
// Build Library UI
// -------------------------------
function buildLibrary() {
  library.innerHTML = "";
  
  const seriesNames = Object.keys(manifest).sort();

  seriesNames.forEach(seriesName => {
    const seasonsObj = manifest[seriesName];
    
    const seriesEl = document.createElement("div");
    seriesEl.className = "series-block";

    const titleEl = document.createElement("h2");
    titleEl.textContent = seriesName.replace(/_/g, " ");
    seriesEl.appendChild(titleEl);

    const seasonListEl = document.createElement("div");
    seasonListEl.className = "season-list";

    const seasonNames = Object.keys(seasonsObj).sort();

    seasonNames.forEach(seasonName => {
      const episodes = seasonsObj[seasonName];

      const seasonBtn = document.createElement("button");
      seasonBtn.className = "season-btn";
      seasonBtn.textContent = seasonName.replace(/_/g, " ");
      
      const epListEl = document.createElement("div");
      epListEl.className = "episode-list hidden";

      seasonBtn.addEventListener("click", () => {
        const wasHidden = epListEl.classList.contains("hidden");
        document.querySelectorAll(".episode-list").forEach(el => el.classList.add("hidden"));
        document.querySelectorAll(".season-btn").forEach(btn => btn.classList.remove("active"));

        if (wasHidden) {
          epListEl.classList.remove("hidden");
          seasonBtn.classList.add("active");
        }
      });

      episodes.forEach((ep, index) => {
        const epBtn = document.createElement("button");
        epBtn.className = "episode-btn";
        epBtn.textContent = ep.name;
        epBtn.addEventListener("click", () => {
          playFile(seriesName, seasonName, index);
        });
        epListEl.appendChild(epBtn);
      });

      seasonListEl.appendChild(seasonBtn);
      seasonListEl.appendChild(epListEl);
    });

    seriesEl.appendChild(seasonListEl);
    library.appendChild(seriesEl);
  });
}

// -------------------------------
// Player Logic (HLS Only)
// -------------------------------
function playFile(series, season, index, startTime = 0) {
  currentSeries = series;
  currentSeason = season;
  currentIndex = index;

  const file = manifest[series][season][index];
  
  const formatUrl = (path) => {
    if (!path) return null;
    if (path.startsWith("http")) return path;
    
    let cleanPath = path.startsWith("/") ? path : `/${path}`;
    if (!cleanPath.startsWith("/hls")) {
      cleanPath = `/hls${cleanPath}`;
    }
    return `${BACKEND_URL}${cleanPath}`;
  };

  const hlsUrl = formatUrl(file.hls_url);
  const directUrl = formatUrl(file.mp4_url);

  nowPlayingDiv.textContent = `Playing: ${file.name}`;
  
  document.querySelectorAll(".episode-btn").forEach(b => b.classList.remove("active"));

  if (Hls.isSupported() && hlsUrl) {
    const hls = new Hls();
    hls.loadSource(hlsUrl);
    hls.attachMedia(video);
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      video.currentTime = startTime;
      video.play();
    });
  } 
  else if (video.canPlayType('application/vnd.apple.mpegurl') && hlsUrl) {
    video.src = hlsUrl;
    video.currentTime = startTime;
    video.play();
  }
  else if (directUrl) {
    video.src = directUrl;
    video.currentTime = startTime;
    video.play();
  }
  else {
    alert("Error: No compatible video source found.");
  }

  document.getElementById("player-container").scrollIntoView({ behavior: "smooth" });
}

// -------------------------------
// Controls & Helpers
// -------------------------------
video.addEventListener("timeupdate", () => {
  if (!video.duration) return;
  if (Math.floor(video.currentTime) % 5 === 0) {
    saveProgress();
  }
});

function saveProgress() {
  if (!currentSeries || !currentSeason) return;
  const state = {
    series: currentSeries,
    season: currentSeason,
    index: currentIndex,
    time: video.currentTime,
    timestamp: Date.now()
  };
  localStorage.setItem(LS_KEY, JSON.stringify(state));
}

function checkForResume() {
  const saved = localStorage.getItem(LS_KEY);
  if (!saved) return;
  
  try {
    const state = JSON.parse(saved);
    if (manifest[state.series] && 
        manifest[state.series][state.season] && 
        manifest[state.series][state.season][state.index]) {
      
      const file = manifest[state.series][state.season][state.index];
      resumeText.textContent = `Resume ${file.name} at ${formatTime(state.time)}?`;
      resumeModal.classList.remove("hidden");

      resumeYes.onclick = () => {
        resumeModal.classList.add("hidden");
        playFile(state.series, state.season, state.index, state.time);
      };
      
      resumeNo.onclick = () => {
        resumeModal.classList.add("hidden");
        localStorage.removeItem(LS_KEY);
      };
    }
  } catch (e) { console.error(e); }
}

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? '0'+s : s}`;
}

sleepTimerSelect.addEventListener("change", (e) => {
  const mins = parseInt(e.target.value);
  if (sleepTimerId) clearTimeout(sleepTimerId);
  
  if (mins > 0) {
    sleepTimerId = setTimeout(() => {
      video.pause();
      alert("Sleep Timer: Video paused.");
      sleepTimerSelect.value = "0"; 
    }, mins * 60 * 1000);
  }
});

playPauseBtn.addEventListener("click", () => {
  if (video.paused) video.play();
  else video.pause();
});

seekBackBtn.addEventListener("click", () => video.currentTime -= 10);
seekFwdBtn.addEventListener("click", () => video.currentTime += 10);

prevBtn.addEventListener("click", () => changeEp(-1));
nextBtn.addEventListener("click", () => changeEp(1));

function changeEp(offset) {
  if (!currentSeries) return;
  const seasonEps = manifest[currentSeries][currentSeason];
  const newIdx = currentIndex + offset;
  
  if (newIdx >= 0 && newIdx < seasonEps.length) {
    playFile(currentSeries, currentSeason, newIdx, 0);
  }
}

video.addEventListener("ended", () => {
  autoNext();
});

function autoNext() {
  if (!currentSeries) return;

  const seasonEps = manifest[currentSeries][currentSeason];

  if (currentIndex < seasonEps.length - 1) {
    playFile(currentSeries, currentSeason, currentIndex + 1, 0);
  } 
  else {
    const seasonKeys = Object.keys(manifest[currentSeries]).sort();
    const currentSeasonIndex = seasonKeys.indexOf(currentSeason);

    if (currentSeasonIndex !== -1 && currentSeasonIndex < seasonKeys.length - 1) {
      const nextSeasonName = seasonKeys[currentSeasonIndex + 1];
      playFile(currentSeries, nextSeasonName, 0, 0);
    }
  }
}

popoutBtn.addEventListener("click", async () => {
  try {
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
    } else if (document.pictureInPictureEnabled && video.src) {
      await video.requestPictureInPicture();
    }
  } catch (err) {
    console.error("PiP Error:", err);
  }
});

loadManifest();