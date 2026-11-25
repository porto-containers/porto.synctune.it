// Optional enhancements. Every page works without this file.
(() => {
  const status = document.createElement("p");
  status.className = "visually-hidden";
  status.setAttribute("role", "status");
  document.body.append(status);

  if (navigator.clipboard) {
    for (const block of document.querySelectorAll(".code")) {
      const code = block.querySelector("pre");
      if (!code) continue;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "copy";
      button.textContent = "Copy";
      const language = block.dataset.lang;
      button.setAttribute("aria-label", language ? `Copy ${language} code` : "Copy code");
      button.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(code.innerText.replace(/\n$/, ""));
          button.textContent = "Copied";
          status.textContent = "Copied to the clipboard.";
        } catch {
          button.textContent = "Select and copy";
          status.textContent = "Copying is not available here. Select the text to copy it.";
        }
        setTimeout(() => {
          button.textContent = "Copy";
        }, 2000);
      });
      block.append(button);
    }
  }

  // Collapse long navigation on narrow screens; it stays open when scripts are off.
  const narrow = window.matchMedia("(max-width: 60rem)");
  const sync = () => {
    for (const details of document.querySelectorAll(".docs-nav .collapsible")) {
      details.open = !narrow.matches;
    }
  };
  sync();
  narrow.addEventListener("change", sync);
})();
