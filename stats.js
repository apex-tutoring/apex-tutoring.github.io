// Apex Tutoring visitor stats.
// Counts only: no cookies, no names, no IP addresses, no third-party trackers.
// Each count is +1 on today's document in Firestore (stats/YYYY-MM-DD); the security
// rules only allow adding 1 to a single counter, and only the teacher can read them.
(function () {
  const KEY = "AIzaSyCT60sj9F7xagX89g7acNX7um1nPA_HYvw", PROJECT = "apex-tutoring-1";
  const live = location.hostname === "apex-tutoring.github.io"; // don't count local testing
  const day = new Date().toISOString().slice(0, 10);
  function track(name) {
    if (!live || !/^[a-z0-9_]{1,40}$/.test(name)) return;
    const doc = `projects/${PROJECT}/databases/(default)/documents/stats/${day}`;
    const body = JSON.stringify({ writes: [{ transform: { document: doc, fieldTransforms: [{ fieldPath: name, increment: { integerValue: "1" } }] } }] });
    try {
      fetch(`https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents:commit?key=${KEY}`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
    } catch (e) { /* stats must never break the page */ }
  }
  window.apexTrack = track;
  const page = (location.pathname.split("/").pop() || "index.html").replace(".html", "") || "index";
  track("views_" + page);
  try { if (localStorage.getItem("apexSeen") !== day) { localStorage.setItem("apexSeen", day); track("visitors"); } } catch (e) {}
})();
