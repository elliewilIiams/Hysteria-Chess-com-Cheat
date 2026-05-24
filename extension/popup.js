const btn = document.getElementById("toggle");
const dot = document.getElementById("dot");
const statusText = document.getElementById("status-text");
const delayInput = document.getElementById("delay");
let active = true;

chrome.storage?.local?.get("delay", (data) => {
  if (data.delay) delayInput.value = data.delay;
});

delayInput.addEventListener("change", async () => {
  const val = parseInt(delayInput.value) || 500;
  chrome.storage?.local?.set({ delay: val });
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: "setDelay", delay: val }).catch(() => {});
});

btn.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: "toggle" }).catch(() => {});
    active = !active;
    dot.className = active ? "dot dot-on" : "dot dot-off";
    statusText.textContent = active ? "Active" : "Disabled";
    btn.textContent = active ? "Disable" : "Enable";
    btn.classList.toggle("active", !active);
  }
});
