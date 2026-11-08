// "Copy address" button on /join/. Without JavaScript the button stays hidden and the
// address remains selectable text, so the page works either way.
(function () {
  var btn = document.getElementById("copy-address");
  if (!btn) return;
  var source = document.getElementById(btn.getAttribute("data-target"));
  var status = document.getElementById("copy-status");
  if (!source) return;
  btn.hidden = false;

  function say(msg) { if (status) status.textContent = msg; }

  function selectAddress() {
    var range = document.createRange();
    range.selectNodeContents(source);
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function legacyCopy() {
    selectAddress();
    var done = false;
    try { done = document.execCommand("copy"); } catch (e) { done = false; }
    return done;
  }

  btn.addEventListener("click", function () {
    var text = source.textContent.trim();
    var fail = function () { selectAddress(); say("Could not copy automatically. The address is selected; press Ctrl+C (or Cmd+C) to copy it."); };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(function () { say("Address copied to the clipboard."); }, function () {
        if (legacyCopy()) say("Address copied to the clipboard."); else fail();
      });
    } else if (legacyCopy()) {
      say("Address copied to the clipboard.");
    } else {
      fail();
    }
  });
})();
