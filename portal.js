// Apex Tutoring portal: Firebase Auth (email/password) + Firestore.
// Data model:
//   teachers/{uid}               → { name }                       (added by hand in the console)
//   families/{email}             → { uid, email }                 (teacher-only)
//   students/{id}                → { name, grade, course, familyUid, familyEmail, sessions, progress, nextGoal }
//   students/{id}/updates/{id}   → { topic, status, note, goal, createdAt }
import { firebaseConfig } from "./firebase-config.js";

const SDK = "https://www.gstatic.com/firebasejs/10.12.2/";
// EmailJS (emailjs.com) sends "new update" emails to families from team.apextutoring@gmail.com.
// These IDs are public by design. Leave as PASTE_… to turn emails off.
const EMAILJS = { service: "apex_gmail", template: "family_update", publicKey: "EiIbnInZ3MH-0EpaB" };
const PORTAL_URL = "https://apex-tutoring.github.io/portal.html";
const SITE = "https://apex-tutoring.github.io/";
// Free worksheet packs that can be assigned as homework (files live in /worksheets)
const PACKS = { "grades-1-2": "Grades 1–2 pack", "grade-3": "Grade 3 pack", "grades-4-5": "Grades 4–5 pack",
  "grades-6-7": "Grades 6–7 pack", "pre-algebra": "Pre-Algebra pack", "competition": "Competition Math pack" };
const TUTOR_EMAIL = "team.apextutoring@gmail.com";
async function emailFamily(student, subject, message, toEmail = student.familyEmail) {
  if (EMAILJS.service.startsWith("PASTE")) throw new Error("Email notifications aren't set up yet.");
  const r = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ service_id: EMAILJS.service, template_id: EMAILJS.template, user_id: EMAILJS.publicKey,
      template_params: { to_email: toEmail, student_name: student.name, subject, message, portal_link: PORTAL_URL,
        // HTML version for the email body: escape everything, then keep line breaks and make links clickable
        message_html: message.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]))
          .replace(/(https:\/\/[^\s<]+)/g, '<a href="$1">$1</a>').replace(/\n/g, "<br>") } }),
  });
  if (!r.ok) throw new Error("Email didn't send (" + r.status + ").");
}
const $ = (id) => document.getElementById(id);
const views = ["loadingView", "notReadyView", "loginView", "familyView", "teacherView"];
function show(id) { views.forEach((v) => ($(v).hidden = v !== id)); }

// Small DOM helper that always uses textContent (never innerHTML) for data.
function el(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") n.className = v;
    else if (k === "text") n.textContent = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  }
  kids.flat().forEach((k) => k != null && n.append(k));
  return n;
}
function setMsg(node, text, kind = "info") { node.textContent = text; node.className = "msg " + kind + (node.classList.contains("full") ? " full" : ""); }
function fmtDate(ts) { const d = ts?.toDate ? ts.toDate() : null; return d ? d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : ""; }
function pillClass(s) { return "pill " + (s || "").split(" ")[0]; }

const configured = firebaseConfig?.apiKey && !firebaseConfig.apiKey.startsWith("PASTE");
if (!configured) {
  show("notReadyView");
} else {
  start().catch((e) => { console.error(e); show("notReadyView"); });
}

async function start() {
  const [{ initializeApp }, A, F] = await Promise.all([
    import(SDK + "firebase-app.js"),
    import(SDK + "firebase-auth.js"),
    import(SDK + "firebase-firestore.js"),
  ]);
  const app = initializeApp(firebaseConfig);
  const auth = A.getAuth(app);
  const db = F.getFirestore(app);
  let secondary = null; // used to create family accounts without signing the teacher out

  const friendly = (e) => ({
    "auth/invalid-credential": "That email and password don't match. Try again or reset your password.",
    "auth/wrong-password": "That email and password don't match.",
    "auth/user-not-found": "No account with that email.",
    "auth/too-many-requests": "Too many attempts. Please wait a few minutes and try again.",
    "auth/invalid-email": "Please enter a valid email address.",
    "permission-denied": "You don't have permission to do that.",
  }[e?.code] || "Something went wrong. Please try again.");

  // ---------- Login ----------
  $("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("loginBtn").disabled = true;
    setMsg($("loginMsg"), "");
    try { await A.signInWithEmailAndPassword(auth, $("loginEmail").value.trim(), $("loginPassword").value); window.apexTrack && apexTrack("portal_logins"); }
    catch (err) { setMsg($("loginMsg"), friendly(err), "err"); }
    finally { $("loginBtn").disabled = false; }
  });
  $("forgotBtn").addEventListener("click", async () => {
    const email = $("loginEmail").value.trim();
    if (!email) return setMsg($("loginMsg"), "Enter your email above first, then click this again.", "info");
    try { await A.sendPasswordResetEmail(auth, email); } catch (_) { /* don't reveal whether the account exists */ }
    setMsg($("loginMsg"), "If that email has an Apex account, a link to set your password is on its way.", "ok");
  });
  $("signOutBtn").addEventListener("click", () => A.signOut(auth));

  A.onAuthStateChanged(auth, async (user) => {
    $("who").hidden = !user;
    if (!user) { stopLive(); selectedId = null; $("editor").replaceChildren(el("p", { class: "empty", text: "Select a student to log a session and update their progress." })); $("loginForm").reset(); return show("loginView"); }
    $("whoEmail").textContent = user.email;
    show("loadingView");
    try {
      const t = await F.getDoc(F.doc(db, "teachers", user.uid));
      if (t.exists()) { $("teacherName").textContent = t.data().name || "Teacher"; await loadTeacher(); show("teacherView"); }
      else { await loadFamily(user); show("familyView"); }
    } catch (err) { console.error(err); setMsg($("loginMsg"), friendly(err), "err"); await A.signOut(auth); }
  });

  async function getUpdates(studentId) {
    const q = F.query(F.collection(db, "students", studentId, "updates"), F.orderBy("createdAt", "desc"));
    return (await F.getDocs(q)).docs.map((d) => ({ id: d.id, ...d.data() }));
  }
  function topicSummary(updates) {
    const latest = new Map();
    [...updates].reverse().forEach((u) => u.topic && latest.set(u.topic.toLowerCase(), u.status));
    return { covered: latest.size, mastered: [...latest.values()].filter((s) => s === "Mastered").length };
  }
  // Only allow http(s) links so a typed "javascript:" URL can never run.
  function safeUrl(u) { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : null; } catch { return null; } }
  function fmtSession(s) {
    if (!s.nextSession) return null;
    const d = new Date(s.nextSession);
    return isNaN(d) ? null : d.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }
  function hasHomework(u) { return !!(u.homework || u.homeworkLink || PACKS[u.worksheet]); }
  // opts: { studentId, role: "teacher" | "family" }
  function updateBody(u, opts = {}) {
    const link = safeUrl(u.homeworkLink || "");
    const pack = PACKS[u.worksheet];
    let hw = null;
    if (hasHomework(u)) {
      hw = el("div", { class: "hw" + (u.homeworkDone ? " done" : "") },
        el("div", {}, el("strong", { text: "📝 Homework: " }), u.homework || ""),
        pack ? el("div", {}, el("a", { href: `worksheets/${u.worksheet}.html`, target: "_blank", rel: "noopener", text: `📄 ${pack}: open & print ↗` })) : null,
        link ? el("div", {}, el("a", { href: link, target: "_blank", rel: "noopener noreferrer", text: "🔗 Open worksheet link ↗" })) : null);
      if (opts.role === "family" && opts.studentId) {
        const box = el("input", { type: "checkbox" }); box.checked = !!u.homeworkDone;
        const lbl = el("label", { class: "check hw-check" }, box, u.homeworkDone ? "Done ✓" : "Mark as done");
        box.addEventListener("change", async () => {
          box.disabled = true;
          try {
            await F.updateDoc(F.doc(db, "students", opts.studentId, "updates", u.id), { homeworkDone: box.checked, homeworkDoneAt: F.serverTimestamp() });
            u.homeworkDone = box.checked; lbl.lastChild.textContent = box.checked ? "Done ✓" : "Mark as done"; hw.classList.toggle("done", box.checked);
          } catch (e) { box.checked = !box.checked; lbl.lastChild.textContent = friendly(e); }
          finally { box.disabled = false; }
        });
        hw.append(lbl);
      } else if (opts.role === "teacher") {
        hw.append(el("span", { class: "hw-status " + (u.homeworkDone ? "yes" : "no"),
          text: u.homeworkDone ? `✓ Done${u.homeworkDoneAt ? " · " + fmtDate(u.homeworkDoneAt) : ""}` : "Not marked done yet" }));
      }
    }
    return [
      el("strong", { text: u.topic || "Session" }), u.status ? el("span", { class: pillClass(u.status), text: u.status }) : null,
      el("time", { text: "  " + fmtDate(u.createdAt) }),
      u.note ? el("p", { text: u.note }) : null, hw,
    ];
  }
  function packSelect(name, current) {
    return el("select", { name }, [["", "None"], ...Object.entries(PACKS)].map(([v, t]) => {
      const o = el("option", { value: v, text: t }); if (v === (current || "")) o.selected = true; return o; }));
  }
  // opts: { studentId, role }. role "teacher" adds Edit / Delete; role "family" adds homework check-off.
  function updatesList(updates, opts = {}) {
    if (!updates.length) return el("p", { class: "empty", text: "No session notes yet." });
    return el("div", { class: "updates" }, updates.map((u) => {
      const art = el("article", {}, updateBody(u, opts));
      if (opts.role === "teacher") art.append(noteActions(opts.studentId, u, art));
      return art;
    }));
  }
  function noteActions(studentId, u, art) {
    const ref = F.doc(db, "students", studentId, "updates", u.id);
    let armed = false;
    const del = el("button", { type: "button", class: "linkbtn danger", text: "Delete", onclick: async () => {
      if (!armed) { armed = true; del.textContent = "Click again to delete"; setTimeout(() => { armed = false; del.textContent = "Delete"; }, 4000); return; }
      try { await F.deleteDoc(ref); await openStudent(studentId); } catch (e) { del.textContent = friendly(e); }
    } });
    const edit = el("button", { type: "button", class: "linkbtn", text: "Edit", onclick: () => {
      const f = el("form", { class: "form-grid edit-form" },
        el("label", {}, "Topic", el("input", { name: "topic", required: "", maxlength: "60", value: u.topic || "" })),
        el("label", {}, "Status", el("select", { name: "status" }, ["Practicing", "Mastered", "Needs review"].map((o) => {
          const opt = el("option", { text: o }); if (o === u.status) opt.selected = true; return opt; }))),
        el("label", { class: "full" }, "Session note", el("textarea", { name: "note", maxlength: "600" }, u.note || "")),
        el("label", { class: "full" }, "Practice / homework", el("input", { name: "homework", maxlength: "200", value: u.homework || "" })),
        el("label", {}, "Worksheet pack", packSelect("worksheet", u.worksheet)),
        el("label", {}, "Worksheet link", el("input", { name: "homeworkLink", type: "url", maxlength: "400", value: u.homeworkLink || "", placeholder: "https://…" })),
        el("div", { class: "row full" }, el("button", { class: "btn small", type: "submit", text: "Save changes" }),
          el("button", { class: "btn light small", type: "button", text: "Cancel", onclick: () => art.replaceChildren(...updateBody(u, { studentId, role: "teacher" }), noteActions(studentId, u, art)) })));
      f.addEventListener("submit", async (e) => {
        e.preventDefault(); const d = new FormData(f);
        const link = d.get("homeworkLink").trim();
        if (link && !safeUrl(link)) { alertMsg(f, "Links must start with https://"); return; }
        try {
          await F.updateDoc(ref, { topic: d.get("topic").trim(), status: d.get("status"), note: d.get("note").trim(), homework: d.get("homework").trim(), homeworkLink: link, worksheet: d.get("worksheet") || "" });
          await openStudent(studentId);
        } catch (err) { alertMsg(f, friendly(err)); }
      });
      art.replaceChildren(f);
    } });
    return el("div", { class: "note-actions" }, edit, del);
  }
  function alertMsg(form, text) {
    let m = form.querySelector(".msg"); if (!m) { m = el("p", { class: "msg full" }); form.append(m); }
    setMsg(m, text, "err");
  }
  function progressBlock(s, updates) {
    const t = topicSummary(updates);
    const pct = Math.max(0, Math.min(100, Number(s.progress) || 0));
    const when = fmtSession(s);
    return [
      when ? el("div", { class: "next-session" }, el("span", { text: "📅" }),
        el("div", {}, el("strong", { text: "Next session: " }), when, s.nextSessionWhere ? el("small", { text: s.nextSessionWhere }) : null)) : null,
      el("div", { class: "stats" },
        el("div", { class: "stat" }, el("strong", { text: String(s.sessions || 0) }), el("span", { text: "Sessions completed" })),
        el("div", { class: "stat" }, el("strong", { text: String(t.covered) }), el("span", { text: "Topics covered" })),
        el("div", { class: "stat" }, el("strong", { text: String(t.mastered) }), el("span", { text: "Topics mastered" }))),
      el("strong", { style: "color:var(--navy)", text: `${s.grade || ""} progress · ${pct}%` }),
      el("div", { class: "bar" }, el("span", { style: `width:${pct}%` })),
      s.nextGoal ? el("div", { class: "goal" }, el("strong", { text: "Next goal: " }), s.nextGoal) : null,
    ];
  }

  // ---------- Progress chart: topics mastered over time (one series, so no legend) ----------
  const SVGNS = "http://www.w3.org/2000/svg";
  function svg(tag, attrs = {}) { const n = document.createElementNS(SVGNS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); return n; }
  function progressChart(updates) {
    const asc = [...updates].filter((u) => u.createdAt?.toDate).sort((a, b) => a.createdAt.toMillis() - b.createdAt.toMillis());
    if (asc.length < 2) return el("p", { class: "empty", text: "Your progress chart appears after two sessions." });
    const latest = new Map(); const pts = asc.map((u) => {
      if (u.topic) latest.set(u.topic.toLowerCase(), u.status);
      return { d: u.createdAt.toDate(), v: [...latest.values()].filter((x) => x === "Mastered").length, topic: u.topic || "Session", status: u.status || "" };
    });
    const W = 380, H = 200, L = 28, R = 12, T = 16, B = 28;
    const t0 = pts[0].d.getTime(), t1 = Math.max(pts.at(-1).d.getTime(), t0 + 1);
    const maxV = Math.max(2, ...pts.map((p) => p.v));
    const x = (d) => L + ((d.getTime() - t0) / (t1 - t0)) * (W - L - R), y = (v) => T + (1 - v / maxV) * (H - T - B);
    const root = svg("svg", { viewBox: `0 0 ${W} ${H}`, class: "pchart", role: "group", "aria-label": `Topics mastered over time: ${pts.at(-1).v} so far` });
    const step = Math.max(1, Math.ceil(maxV / 4));
    for (let v = 0; v <= maxV; v += step) {
      root.append(svg("line", { x1: L, x2: W - R, y1: y(v), y2: y(v), class: "grid" }));
      const t = svg("text", { x: L - 8, y: y(v) + 4, class: "tick", "text-anchor": "end" }); t.textContent = v; root.append(t);
    }
    const fmt = (d) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    [[pts[0].d, "start"], [pts.at(-1).d, "end"]].forEach(([d, a]) => { const t = svg("text", { x: x(d), y: H - 8, class: "tick", "text-anchor": a }); t.textContent = fmt(d); root.append(t); });
    // step line: the count only changes at a session
    let path = `M${x(pts[0].d)},${y(pts[0].v)}`; for (let i = 1; i < pts.length; i++) path += `H${x(pts[i].d)}V${y(pts[i].v)}`;
    root.append(svg("path", { d: path, class: "line" }));
    const wrap = el("div", { class: "pchart-wrap" }); const tip = el("div", { class: "ptip", role: "status" }); tip.hidden = true;
    pts.forEach((p) => {
      root.append(svg("circle", { cx: x(p.d), cy: y(p.v), r: 4, class: "dot" }));
      const hit = svg("circle", { cx: x(p.d), cy: y(p.v), r: 14, class: "hit", tabindex: "0", role: "button", "aria-label": `${fmt(p.d)}: ${p.topic} (${p.status}). ${p.v} topics mastered` });
      const show = () => { tip.hidden = false; tip.replaceChildren(el("strong", { text: `${p.v} mastered` }), el("span", { text: `${fmt(p.d)} · ${p.topic}${p.status ? " (" + p.status + ")" : ""}` }));
        tip.style.left = `${(x(p.d) / W) * 100}%`; tip.style.top = `${(y(p.v) / H) * 100}%`; };
      hit.addEventListener("mouseenter", show); hit.addEventListener("focus", show);
      hit.addEventListener("mouseleave", () => (tip.hidden = true)); hit.addEventListener("blur", () => (tip.hidden = true));
      root.append(hit);
    });
    wrap.append(root, tip);
    return el("div", {}, el("p", { class: "chart-title", text: "Topics mastered over time" }), wrap);
  }

  // ---------- Session calendar: past sessions (dots) + next session (ring) ----------
  function sessionCalendar(s, updates) {
    const sessions = new Map();
    updates.forEach((u) => { const d = u.createdAt?.toDate?.(); if (!d) return; const k = d.toDateString(); sessions.set(k, [...(sessions.get(k) || []), u.topic || "Session"]); });
    const next = s.nextSession ? new Date(s.nextSession) : null;
    let month = new Date(); month.setDate(1);
    const box = el("div", { class: "cal" });
    function render() {
      const y = month.getFullYear(), m = month.getMonth(), first = new Date(y, m, 1).getDay(), days = new Date(y, m + 1, 0).getDate();
      const today = new Date().toDateString();
      const cells = [];
      for (let i = 0; i < first; i++) cells.push(el("span", { class: "day blank" }));
      for (let d = 1; d <= days; d++) {
        const k = new Date(y, m, d).toDateString(), past = sessions.get(k), isNext = next && next.toDateString() === k;
        const label = [past ? `Session: ${past.join(", ")}` : "", isNext ? `Next session ${fmtSession(s)}` : ""].filter(Boolean).join(". ");
        cells.push(el("span", { class: "day" + (past ? " had" : "") + (isNext ? " next" : "") + (k === today ? " today" : ""), title: label, "aria-label": `${d}${label ? ". " + label : ""}` }, String(d)));
      }
      box.replaceChildren(
        el("div", { class: "cal-head" },
          el("button", { type: "button", class: "cal-nav", "aria-label": "Previous month", text: "‹", onclick: () => { month.setMonth(month.getMonth() - 1); render(); } }),
          el("strong", { text: month.toLocaleDateString(undefined, { month: "long", year: "numeric" }) }),
          el("button", { type: "button", class: "cal-nav", "aria-label": "Next month", text: "›", onclick: () => { month.setMonth(month.getMonth() + 1); render(); } })),
        el("div", { class: "cal-grid" }, ["S", "M", "T", "W", "T", "F", "S"].map((d) => el("span", { class: "dow", text: d })), cells),
        el("div", { class: "cal-key" }, el("span", {}, el("i", { class: "k had" }), "Session held"), el("span", {}, el("i", { class: "k next" }), "Next session")));
    }
    render();
    return box;
  }

  // ---------- Messages (live chat between tutor and family) ----------
  let unsubs = [];
  function stopLive() { unsubs.forEach((u) => u()); unsubs = []; }
  function fmtTime(ts) {
    const d = ts?.toDate ? ts.toDate() : null;
    return d ? d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "Sending…";
  }
  function messageThread(student, role) {
    const mine = role, theirs = role === "teacher" ? "family" : "teacher";
    const list = el("div", { class: "thread-list", role: "log", "aria-live": "polite" }, el("p", { class: "empty", text: "Loading messages…" }));
    const box = el("textarea", { name: "text", maxlength: "1000", required: "", rows: "2",
      placeholder: role === "teacher" ? `Message ${student.name}'s family…` : "Message your tutor…" });
    const notify = el("input", { type: "checkbox", name: "notify", checked: "" });
    const status = el("p", { class: "msg", role: "status" });
    const form = el("form", { class: "thread-form" }, box,
      el("div", { class: "row" }, el("button", { class: "btn small", type: "submit", text: "Send" }),
        role === "teacher" ? el("label", { class: "check" }, notify, "Email the family") : el("small", { class: "muted", text: "Your tutor gets an email when you send a message." })),
      status);
    box.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) form.requestSubmit(); });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const text = box.value.trim(); if (!text) return;
      const btn = form.querySelector("button"); btn.disabled = true; setMsg(status, "");
      try {
        await F.addDoc(F.collection(db, "students", student.id, "messages"), { from: mine, text, createdAt: F.serverTimestamp() });
        box.value = "";
        const doEmail = role === "teacher" ? notify.checked : true;
        if (doEmail) {
          const subject = role === "teacher" ? `New message from Veer about ${student.name}` : `New message from ${student.name}'s family`;
          const to = role === "teacher" ? student.familyEmail : TUTOR_EMAIL;
          try { await emailFamily(student, subject, text, to); setMsg(status, role === "teacher" ? "Sent. Family emailed ✓" : "Sent ✓", "ok"); }
          catch (mailErr) { setMsg(status, "Sent (email notice didn't go out: " + mailErr.message + ")", "info"); }
        } else setMsg(status, "Sent ✓", "ok");
      } catch (err) { setMsg(status, friendly(err), "err"); }
      finally { btn.disabled = false; }
    });
    const q = F.query(F.collection(db, "students", student.id, "messages"), F.orderBy("createdAt"));
    unsubs.push(F.onSnapshot(q, (snap) => {
      const msgs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.replaceChildren(...(msgs.length ? msgs.map((m) => {
        const bubble = el("div", { class: "bubble " + (m.from === mine ? "me" : "them") },
          el("span", { class: "who", text: m.from === "teacher" ? "Veer" : `${student.name}'s family` }),
          el("p", { text: m.text }), el("time", { text: fmtTime(m.createdAt) }));
        if (role === "teacher") bubble.append(el("button", { type: "button", class: "linkbtn danger tiny", text: "Delete", onclick: async () => {
          try { await F.deleteDoc(F.doc(db, "students", student.id, "messages", m.id)); } catch (err) { setMsg(status, friendly(err), "err"); } } }));
        return bubble;
      }) : [el("p", { class: "empty", text: role === "teacher" ? "No messages yet. Say hi to the family!" : "No messages yet. Questions about homework or scheduling? Send one here." })]));
      list.scrollTop = list.scrollHeight;
      if (role === "teacher" && msgs.length) F.updateDoc(F.doc(db, "students", student.id), { teacherSeenAt: F.serverTimestamp() }).catch(() => {});
    }, () => list.replaceChildren(el("p", { class: "empty", text: "Messages couldn't load." }))));
    return el("div", { class: "thread" }, list, form);
  }

  // ---------- Monthly progress report (printable; the tutor can also email it) ----------
  const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const monthName = (k) => { const [y, m] = k.split("-").map(Number); return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" }); };
  function reportData(s, updates, key) {
    const inMonth = updates.filter((u) => u.createdAt?.toDate && monthKey(u.createdAt.toDate()) === key)
      .sort((a, b) => a.createdAt.toMillis() - b.createdAt.toMillis());
    const topics = [...new Set(inMonth.map((u) => u.topic).filter(Boolean))];
    const mastered = [...new Set(inMonth.filter((u) => u.status === "Mastered").map((u) => u.topic))];
    const hw = inMonth.filter(hasHomework);
    return { inMonth, topics, mastered, hwTotal: hw.length, hwDone: hw.filter((u) => u.homeworkDone).length,
      allMastered: topicSummary(updates).mastered, progress: Math.max(0, Math.min(100, Number(s.progress) || 0)) };
  }
  function reportSheet(s, updates, key) {
    const r = reportData(s, updates, key);
    const tile = (n, label) => el("div", { class: "rtile" }, el("strong", { text: String(n) }), el("span", { text: label }));
    return el("div", { class: "report-sheet" },
      el("div", { class: "rhead" }, el("div", { class: "rbrand" }, el("img", { src: "logo.svg", alt: "" }), "APEX TUTORING"),
        el("div", { class: "rtitle" }, el("b", { text: "Monthly Progress Report" }), el("span", { text: monthName(key) }))),
      el("h2", { text: s.name }), el("p", { class: "muted", style: "margin:0 0 14px", text: `${s.grade} · ${s.course}` }),
      el("div", { class: "rtiles" }, tile(r.inMonth.length, "Sessions this month"), tile(r.topics.length, "Topics worked on"),
        tile(r.mastered.length, "Mastered this month"), tile(r.hwTotal ? `${r.hwDone}/${r.hwTotal}` : "—", "Homework done")),
      el("p", { class: "rsum", text: `Overall: ${s.sessions || 0} sessions completed · ${r.allMastered} topics mastered · course progress ${r.progress}%` }),
      el("h3", { text: "Sessions" }),
      r.inMonth.length ? el("table", { class: "rtable" },
        el("thead", {}, el("tr", {}, ["Date", "Topic", "Status", "Homework"].map((h) => el("th", { text: h })))),
        el("tbody", {}, r.inMonth.map((u) => el("tr", {}, el("td", { text: fmtDate(u.createdAt) }), el("td", { text: u.topic || "Session" }),
          el("td", { text: u.status || "" }), el("td", { text: hasHomework(u) ? (u.homeworkDone ? "✓ Done" : "Not done") : "—" })))))
        : el("p", { class: "empty", text: "No sessions recorded this month." }),
      r.inMonth.some((u) => u.note) ? el("h3", { text: "Tutor notes" }) : null,
      r.inMonth.some((u) => u.note) ? el("ul", { class: "rnotes" }, r.inMonth.filter((u) => u.note).map((u) => el("li", {}, el("b", { text: `${fmtDate(u.createdAt)} · ${u.topic || "Session"}: ` }), u.note))) : null,
      el("h3", { text: "Looking ahead" }),
      el("ul", { class: "rnotes" }, el("li", {}, el("b", { text: "Next goal: " }), s.nextGoal || "To be set at the next session"),
        el("li", {}, el("b", { text: "Next session: " }), fmtSession(s) || "Not scheduled yet")),
      el("p", { class: "rfoot", text: `Prepared by Veer · Apex Tutoring · ${new Date().toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })} · apex-tutoring.github.io` }));
  }
  function reportText(s, updates, key) {
    const r = reportData(s, updates, key);
    const lines = [`${monthName(key)} progress report for ${s.name} (${s.grade}, ${s.course})`, "",
      `Sessions this month: ${r.inMonth.length}`, `Topics worked on: ${r.topics.join(", ") || "none"}`,
      `Mastered this month: ${r.mastered.join(", ") || "none yet"}`, `Homework done: ${r.hwTotal ? r.hwDone + " of " + r.hwTotal : "none assigned"}`,
      `Overall: ${s.sessions || 0} sessions · ${r.allMastered} topics mastered · course progress ${r.progress}%`, ""];
    r.inMonth.filter((u) => u.note).forEach((u) => lines.push(`${fmtDate(u.createdAt)} · ${u.topic || "Session"}: ${u.note}`));
    lines.push("", `Next goal: ${s.nextGoal || "to be set at the next session"}`, `Next session: ${fmtSession(s) || "not scheduled yet"}`);
    return lines.join("\n");
  }
  function openReport(s, updates, role) {
    const months = [...new Set([monthKey(new Date()), ...updates.filter((u) => u.createdAt?.toDate).map((u) => monthKey(u.createdAt.toDate()))])].sort().reverse();
    let key = months[0];
    const holder = el("div", {});
    const status = el("p", { class: "msg", role: "status" });
    const sel = el("select", { "aria-label": "Report month" }, months.map((k) => el("option", { value: k, text: monthName(k) })));
    sel.addEventListener("change", () => { key = sel.value; holder.replaceChildren(reportSheet(s, updates, key)); });
    const close = () => { overlay.remove(); document.body.classList.remove("report-open"); };
    const overlay = el("div", { class: "report-overlay", role: "dialog", "aria-modal": "true", "aria-label": "Monthly progress report" },
      el("div", { class: "report-panel" },
        el("div", { class: "report-bar" }, sel,
          el("button", { type: "button", class: "btn small", text: "🖨 Print / Save PDF", onclick: () => window.print() }),
          role === "teacher" ? el("button", { type: "button", class: "btn light small", text: "✉️ Email to family", onclick: async () => {
            try { await emailFamily(s, `${monthName(key)} progress report for ${s.name}`, reportText(s, updates, key)); setMsg(status, `Report emailed to ${s.familyEmail} ✓`, "ok"); }
            catch (e) { setMsg(status, "Email didn't send: " + e.message, "err"); } } }) : null,
          el("button", { type: "button", class: "btn light small", text: "Close", onclick: close })),
        status, holder));
    overlay.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
    holder.append(reportSheet(s, updates, key));
    document.body.append(overlay); document.body.classList.add("report-open");
    sel.focus();
  }

  // ---------- Resource library: the tutor adds links by level; families see the ones for their level ----------
  const LEVELS = ["All levels", "Grades 1–2", "Grade 3", "Grades 4–5", "Grades 6–7", "Pre-Algebra", "Test Prep"];
  const LEVEL_PACK = { "Grades 1–2": "grades-1-2", "Grade 3": "grade-3", "Grades 4–5": "grades-4-5", "Grades 6–7": "grades-6-7", "Pre-Algebra": "pre-algebra", "Test Prep": "competition" };
  function levelFor(s) {
    const g = s.grade || "";
    if (/Grade [12]$/.test(g)) return "Grades 1–2";
    if (g === "Grade 3") return "Grade 3";
    if (/Grade [45]$/.test(g)) return "Grades 4–5";
    if (/Grade [67]$/.test(g)) return "Grades 6–7";
    return "Pre-Algebra";
  }
  let resourceCache = null;
  async function getResources(force = false) {
    if (!resourceCache || force) resourceCache = (await F.getDocs(F.collection(db, "resources"))).docs.map((d) => ({ id: d.id, ...d.data() }));
    return resourceCache;
  }
  function resourceItem(r, extra) {
    const url = safeUrl(r.url || "");
    return el("li", { class: "res" },
      el("div", {}, url ? el("a", { href: url, target: "_blank", rel: "noopener noreferrer", text: `${r.title} ↗` }) : el("strong", { text: r.title }),
        el("span", { class: "res-level", text: r.level }), r.note ? el("p", { text: r.note }) : null), extra || null);
  }
  async function familyResources(s) {
    const levels = new Set(["All levels", levelFor(s)]); if (s.course === "Test Prep") levels.add("Test Prep");
    let items = [];
    try { items = (await getResources()).filter((r) => levels.has(r.level)); } catch {}
    const pack = LEVEL_PACK[levelFor(s)];
    const built = [{ title: `${PACKS[pack]} (free Apex worksheet)`, url: `${SITE}worksheets/${pack}.html`, level: levelFor(s), note: "Printable practice with an answer key." }];
    return el("ul", { class: "res-list" }, [...items, ...built].map((r) => resourceItem(r)));
  }
  async function loadResources() {
    const box = $("resourcesBox"); if (!box) return;
    const status = el("p", { class: "msg full", role: "status" });
    const form = el("form", { class: "form-grid" },
      el("label", { class: "full" }, "Title", el("input", { name: "title", required: "", maxlength: "80", placeholder: "e.g. Khan Academy: Long division" })),
      el("label", {}, "Link", el("input", { name: "url", type: "url", required: "", maxlength: "400", placeholder: "https://…" })),
      el("label", {}, "Level", el("select", { name: "level" }, LEVELS.map((l) => el("option", { text: l })))),
      el("label", { class: "full" }, "Short note (optional)", el("input", { name: "note", maxlength: "160", placeholder: "Why it helps" })),
      el("button", { class: "btn small full", type: "submit", text: "Add resource" }), status);
    form.addEventListener("submit", async (e) => {
      e.preventDefault(); const f = new FormData(form); const url = f.get("url").trim();
      if (!safeUrl(url)) return setMsg(status, "Links must start with https://", "err");
      try { await F.addDoc(F.collection(db, "resources"), { title: f.get("title").trim(), url, level: f.get("level"), note: f.get("note").trim(), createdAt: F.serverTimestamp() });
        form.reset(); setMsg(status, "Added. Families at that level can see it now.", "ok"); render(true); }
      catch (err) { setMsg(status, friendly(err), "err"); }
    });
    const list = el("ul", { class: "res-list" });
    async function render(force) {
      try {
        const rs = (await getResources(force)).sort((a, b) => LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level));
        list.replaceChildren(...(rs.length ? rs.map((r) => resourceItem(r, el("button", { type: "button", class: "linkbtn danger", text: "Delete", onclick: async () => {
          try { await F.deleteDoc(F.doc(db, "resources", r.id)); render(true); } catch (err) { setMsg(status, friendly(err), "err"); } } })))
          : [el("li", { class: "empty", text: "No resources yet. Free worksheet packs are already shown to each family automatically." })]));
      } catch { list.replaceChildren(el("li", { class: "empty", text: "Resources couldn't load." })); }
    }
    box.replaceChildren(form, list); render(true);
  }

  // ---------- Family view ----------
  async function loadFamily(user) {
    const box = $("familyStudents");
    stopLive(); box.replaceChildren();
    const snap = await F.getDocs(F.query(F.collection(db, "students"), F.where("familyUid", "==", user.uid)));
    if (snap.empty) { box.append(el("div", { class: "card" }, el("p", { class: "empty", text: "Your tutor hasn't added your student profile yet. Check back after your first session." }))); return; }
    for (const d of snap.docs) {
      const s = d.data();
      const updates = await getUpdates(d.id);
      box.append(el("article", { class: "card" },
        el("div", { class: "card-head" }, el("div", {}, el("h2", { text: s.name }), el("p", { class: "muted", style: "margin:0", text: `${s.grade} · ${s.course}` })),
          el("button", { type: "button", class: "btn light small", text: "📄 Monthly report", onclick: () => openReport({ id: d.id, ...s }, updates, "family") })),
        progressBlock(s, updates),
        el("div", { class: "viz-row" }, el("div", {}, progressChart(updates)), el("div", {}, el("p", { class: "chart-title", text: "Session calendar" }), sessionCalendar(s, updates))),
        el("h3", { style: "margin-top:16px", text: "💬 Messages with your tutor" }), messageThread({ id: d.id, ...s }, "family"),
        el("h3", { style: "margin-top:20px", text: `📚 Resources for ${levelFor(s)}` }), await familyResources(s),
        el("h3", { style: "margin-top:20px", text: "Tutor updates & homework" }), updatesList(updates, { studentId: d.id, role: "family" })));
    }
    box.append(await reviewCard(user, snap.docs[0].data()));
  }

  // ---------- Reviews (families write one; the tutor approves before it shows on the homepage) ----------
  async function reviewCard(user, firstStudent) {
    const ref = F.doc(db, "testimonials", user.uid);
    let existing = null; try { const r = await F.getDoc(ref); if (r.exists()) existing = r.data(); } catch {}
    const status = el("p", { class: "msg", role: "status" });
    if (existing) setMsg(status, existing.approved ? "✓ Your review is on the Apex homepage. Thank you!" : "Thanks! Your review is waiting for Veer's approval.", existing.approved ? "ok" : "info");
    const stars = el("select", { name: "rating", "aria-label": "Rating" }, [5, 4, 3, 2, 1].map((n) => { const o = el("option", { value: String(n), text: "★".repeat(n) + "☆".repeat(5 - n) }); if (existing && existing.rating === n) o.selected = true; return o; }));
    const form = el("form", { class: "form-grid" },
      el("label", {}, "Your rating", stars),
      el("label", {}, "Name to show", el("input", { name: "name", required: "", maxlength: "60", value: existing?.name || `Parent of a ${firstStudent.grade || ""} student`.replace("  ", " ") })),
      el("label", { class: "full" }, "Your review", el("textarea", { name: "text", required: "", minlength: "10", maxlength: "600", placeholder: "How has tutoring with Veer helped your student?" }, existing?.text || "")),
      el("div", { class: "row full" }, el("button", { class: "btn small", type: "submit", text: existing ? "Update review" : "Submit review" }), el("small", { class: "muted", text: "Shown on the homepage after Veer approves it. Only the name you enter is shown." })),
      status);
    form.addEventListener("submit", async (e) => {
      e.preventDefault(); const f = new FormData(form);
      try {
        await F.setDoc(ref, { name: f.get("name").trim(), rating: Number(f.get("rating")), text: f.get("text").trim(), approved: false, createdAt: F.serverTimestamp() });
        setMsg(status, "Thanks! Your review is waiting for Veer's approval.", "ok");
        emailFamily({ name: firstStudent.name }, "New review waiting for approval", `${f.get("name").trim()} left a ${f.get("rating")}-star review:\n\n${f.get("text").trim()}\n\nApprove it in the teacher dashboard.`, TUTOR_EMAIL).catch(() => {});
      } catch (err) { setMsg(status, friendly(err), "err"); }
    });
    return el("article", { class: "card" }, el("h2", { text: "⭐ Leave a review" }), el("p", { class: "muted", style: "margin-top:0", text: "Happy with tutoring? A short review helps other families find Apex." }), form);
  }

  // ---------- Teacher view ----------
  let students = [];
  let selectedId = null;

  // Website stats (counts written by stats.js; only the teacher can read them)
  async function loadStats() {
    const box = $("statsBox"); if (!box) return;
    try {
      const days = 30, since = new Date(Date.now() - (days - 1) * 864e5).toISOString().slice(0, 10);
      const snap = await F.getDocs(F.query(F.collection(db, "stats"), F.where(F.documentId(), ">=", since)));
      const byDay = Object.fromEntries(snap.docs.map((d) => [d.id, d.data()]));
      const list = []; for (let i = days - 1; i >= 0; i--) { const k = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10); list.push([k, byDay[k] || {}]); }
      const sum = (key, n) => list.slice(-n).reduce((t, [, v]) => t + (key === "views" ? Object.entries(v).filter(([k]) => k.startsWith("views_")).reduce((a, [, x]) => a + x, 0) : (v[key] || 0)), 0);
      const tiles = [["Visitors", "visitors"], ["Page views", "views"], ["Quizzes finished", "quiz_finished"], ["Intro calls booked", "bookings"], ["Messages sent", "messages"], ["Portal logins", "portal_logins"]];
      const max = Math.max(1, ...list.map(([, v]) => v.visitors || 0));
      box.replaceChildren(
        el("div", { class: "stat-tiles" }, tiles.map(([label, key]) => el("div", { class: "stat" },
          el("strong", { text: String(sum(key, 7)) }), el("span", { text: `${label} · 7 days` }), el("small", { text: `${sum(key, 30)} in 30 days` })))),
        el("div", { class: "spark", "aria-label": "Visitors per day, last 30 days" }, list.map(([k, v]) =>
          el("i", { style: `height:${Math.max(4, Math.round(((v.visitors || 0) / max) * 100))}%`, title: `${k}: ${v.visitors || 0} visitors` }))),
        el("p", { class: "muted", style: "font-size:.8rem;margin:6px 0 0", text: "Visitors per day, last 30 days. Counts only, with no cookies or personal info." }));
    } catch (e) { box.replaceChildren(el("p", { class: "empty", text: "Stats aren't available yet." })); }
  }

  async function loadTeacher() {
    loadStats(); loadReviews(); loadResources();
    const snap = await F.getDocs(F.query(F.collection(db, "students"), F.orderBy("name")));
    students = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    // Flag students whose newest message is from the family and hasn't been seen yet
    await Promise.all(students.map(async (st) => {
      try {
        const last = await F.getDocs(F.query(F.collection(db, "students", st.id, "messages"), F.orderBy("createdAt", "desc"), F.limit(1)));
        const m = last.docs[0]?.data();
        st.unread = !!(m && m.from === "family" && (!st.teacherSeenAt || (m.createdAt?.toMillis?.() || 0) > (st.teacherSeenAt?.toMillis?.() || 0)));
      } catch { st.unread = false; }
    }));
    renderList();
    if (selectedId && students.some((s) => s.id === selectedId)) await openStudent(selectedId);
  }
  function renderList() {
    const ul = $("studentList");
    ul.replaceChildren();
    if (!students.length) { ul.append(el("li", { class: "empty", text: "No students yet. Add one below." })); return; }
    students.forEach((s) => ul.append(el("li", {},
      el("button", { type: "button", class: s.id === selectedId ? "active" : "", onclick: () => openStudent(s.id, true) },
        el("strong", { text: s.name }), s.unread && s.id !== selectedId ? el("span", { class: "unread", text: "💬 New message" }) : null,
        el("small", { text: `${s.grade} · ${s.familyEmail}` })))));
  }

  async function openStudent(id, scroll = false) {
    stopLive();
    selectedId = id; const cur = students.find((x) => x.id === id); if (cur) cur.unread = false; renderList();
    if (scroll && matchMedia("(max-width: 820px)").matches) $("editor").scrollIntoView({ behavior: "smooth", block: "start" });
    const s = students.find((x) => x.id === id);
    const ed = $("editor");
    ed.replaceChildren(el("p", { class: "muted", text: "Loading…" }));
    const updates = await getUpdates(id);
    const msg = el("p", { class: "msg full", role: "status" });

    const progressInput = el("input", { type: "number", min: "0", max: "100", value: String(s.progress || 0), "aria-label": "Course progress percent" });
    const saveProgress = el("button", { class: "btn light small", type: "button", text: "Save %", onclick: async () => {
      try { await F.updateDoc(F.doc(db, "students", id), { progress: Math.max(0, Math.min(100, Number(progressInput.value) || 0)) }); setMsg(msg, "Progress saved.", "ok"); await loadTeacher(); }
      catch (e) { setMsg(msg, friendly(e), "err"); } } });
    const resend = el("button", { class: "linkbtn", type: "button", text: "Resend password email", onclick: async () => {
      try { await A.sendPasswordResetEmail(auth, s.familyEmail); setMsg(msg, `Password email sent to ${s.familyEmail}.`, "ok"); }
      catch (e) { setMsg(msg, friendly(e), "err"); } } });

    msg.id = "logMsg";
    const form = el("form", { class: "form-grid" },
      el("label", {}, "Topic", el("input", { name: "topic", required: "", maxlength: "60", placeholder: "e.g. Long division" })),
      el("label", {}, "Status", el("select", { name: "status" }, ["Practicing", "Mastered", "Needs review"].map((o) => el("option", { text: o })))),
      el("label", { class: "full" }, "Session note", el("textarea", { name: "note", maxlength: "600", placeholder: "What did they work on? What went well?" })),
      el("label", { class: "full" }, "Practice / homework (optional)", el("input", { name: "homework", maxlength: "200", placeholder: "e.g. 10 long division problems, page 3" })),
      el("label", {}, "Assign a worksheet pack (optional)", packSelect("worksheet", "")),
      el("label", {}, "Other worksheet link (optional)", el("input", { name: "homeworkLink", type: "url", maxlength: "400", placeholder: "https://…" })),
      el("label", { class: "full" }, "Next goal (optional)", el("input", { name: "goal", maxlength: "160", value: s.nextGoal || "" })),
      el("label", { class: "check full" }, el("input", { type: "checkbox", name: "counts", checked: "" }), "Count this as a completed session"),
      el("label", { class: "check full" }, el("input", { type: "checkbox", name: "notify", checked: "" }), `Email the family about this update (${s.familyEmail})`),
      el("button", { class: "btn full", type: "submit", text: "Add update" }), msg);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = new FormData(form);
      const link = f.get("homeworkLink").trim();
      if (link && !safeUrl(link)) return setMsg(msg, "Worksheet links must start with https://", "err");
      const btn = form.querySelector("button[type=submit]"); btn.disabled = true;
      try {
        await F.addDoc(F.collection(db, "students", id, "updates"), {
          topic: f.get("topic").trim(), status: f.get("status"), note: f.get("note").trim(), goal: f.get("goal").trim(),
          homework: f.get("homework").trim(), homeworkLink: link, worksheet: f.get("worksheet") || "", homeworkDone: false, createdAt: F.serverTimestamp(),
        });
        const patch = { nextGoal: f.get("goal").trim(), lastSession: F.serverTimestamp() };
        if (f.get("counts")) patch.sessions = F.increment(1);
        await F.updateDoc(F.doc(db, "students", id), patch);
        await loadTeacher();
        let note = "Update added. The family can see it now.";
        if (f.get("notify")) {
          const lines = [`New session update for ${s.name}:`, "", `Topic: ${f.get("topic").trim()} (${f.get("status")})`];
          if (f.get("note").trim()) lines.push(`Notes: ${f.get("note").trim()}`);
          if (f.get("homework").trim()) lines.push(`Practice: ${f.get("homework").trim()}`);
          if (PACKS[f.get("worksheet")]) lines.push(`Worksheet: ${PACKS[f.get("worksheet")]} – ${SITE}worksheets/${f.get("worksheet")}.html`);
          if (link) lines.push(`Worksheet: ${link}`);
          if (f.get("goal").trim()) lines.push(`Next goal: ${f.get("goal").trim()}`);
          try { await emailFamily(s, `New session update for ${s.name}`, lines.join("\n")); note += " Family emailed ✓"; }
          catch (mailErr) { note += " (Email not sent: " + mailErr.message + ")"; }
        }
        setMsg($("logMsg"), note, "ok");
      } catch (err) { setMsg(msg, friendly(err), "err"); btn.disabled = false; }
    });

    // Next session: date/time plus where (Zoom link, library, etc.)
    const nsMsg = el("p", { class: "msg full", role: "status" });
    nsMsg.id = "nsMsg";
    const nsForm = el("form", { class: "form-grid" },
      el("label", {}, "Date & time", el("input", { name: "when", type: "datetime-local", value: s.nextSession || "" })),
      el("label", {}, "Where (optional)", el("input", { name: "where", maxlength: "160", value: s.nextSessionWhere || "", placeholder: "Zoom link or location" })),
      el("label", { class: "check full" }, el("input", { type: "checkbox", name: "notify", checked: "" }), "Email the family the new session time"),
      el("div", { class: "row full" },
        el("button", { class: "btn small", type: "submit", text: "Save next session" }),
        s.nextSession ? el("button", { class: "btn light small", type: "button", text: "Clear", onclick: () => saveNext("", "") }) : null),
      nsMsg);
    async function saveNext(when, where, notify = false) {
      try {
        await F.updateDoc(F.doc(db, "students", id), { nextSession: when, nextSessionWhere: where });
        await loadTeacher();
        let note = when ? "Next session saved. The family can see it now." : "Next session cleared.";
        if (when && notify) {
          const nice = fmtSession({ nextSession: when });
          const lines = [`${s.name}'s next tutoring session is scheduled:`, "", `When: ${nice}`];
          if (where) lines.push(`Where: ${where}`);
          try { await emailFamily(s, `Next session for ${s.name}: ${nice}`, lines.join("\n")); note += " Family emailed ✓"; }
          catch (mailErr) { note += " (Email not sent: " + mailErr.message + ")"; }
        }
        setMsg($("nsMsg"), note, "ok");
      } catch (err) { setMsg(nsMsg, friendly(err), "err"); }
    }
    nsForm.addEventListener("submit", (e) => {
      e.preventDefault(); const d = new FormData(nsForm);
      if (!d.get("when")) return setMsg(nsMsg, "Pick a date and time first.", "err");
      saveNext(d.get("when"), d.get("where").trim(), !!d.get("notify"));
    });

    ed.replaceChildren(
      el("h2", { text: s.name }), el("p", { class: "muted", style: "margin:0", text: `${s.grade} · ${s.course} · ${s.familyEmail}` }),
      el("div", { class: "row", style: "gap:16px;margin-top:4px" }, resend, studentAdmin(s),
        el("button", { type: "button", class: "btn light small", text: "📄 Monthly report", onclick: () => openReport(s, updates, "teacher") })),
      ...progressBlock(s, updates).filter(Boolean),
      el("div", { class: "viz-row" }, el("div", {}, progressChart(updates)), el("div", {}, el("p", { class: "chart-title", text: "Session calendar" }), sessionCalendar(s, updates))),
      el("div", { class: "row" }, el("strong", { style: "color:var(--navy)", text: "Course progress %" }), progressInput, saveProgress),
      el("h3", { style: "margin-top:20px", text: "Next session" }), nsForm,
      el("h3", { style: "margin-top:20px", text: "Log a session" }), form,
      el("h3", { style: "margin-top:20px", text: "💬 Messages" }), messageThread(s, "teacher"),
      el("h3", { style: "margin-top:20px", text: "Past updates" }), updatesList(updates, { studentId: id, role: "teacher" }));
  }

  // Edit a student's details, or remove the student (and their notes and messages)
  function studentAdmin(s) {
    const holder = el("span", {});
    const editBtn = el("button", { type: "button", class: "linkbtn", text: "Edit details", onclick: () => {
      const gradeSel = el("select", { name: "grade" }, ["Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6", "Grade 7", "Pre-Algebra"].map((g) => { const o = el("option", { text: g }); if (g === s.grade) o.selected = true; return o; }));
      const courseSel = el("select", { name: "course" }, ["Elementary School Math", "Middle School Math", "Test Prep"].map((c) => { const o = el("option", { text: c }); if (c === s.course) o.selected = true; return o; }));
      const f = el("form", { class: "form-grid edit-form card", style: "margin-top:10px" },
        el("label", { class: "full" }, "Student name", el("input", { name: "name", required: "", maxlength: "60", value: s.name })),
        el("label", {}, "Grade", gradeSel), el("label", {}, "Course", courseSel),
        el("div", { class: "row full" }, el("button", { class: "btn small", type: "submit", text: "Save details" }),
          el("button", { class: "btn light small", type: "button", text: "Cancel", onclick: () => f.remove() })));
      f.addEventListener("submit", async (e) => {
        e.preventDefault(); const d = new FormData(f);
        try { await F.updateDoc(F.doc(db, "students", s.id), { name: d.get("name").trim(), grade: d.get("grade"), course: d.get("course") }); await loadTeacher(); }
        catch (err) { alertMsg(f, friendly(err)); }
      });
      $("editor").querySelector("h2").after(f);
    } });
    let armed = false;
    const removeBtn = el("button", { type: "button", class: "linkbtn danger", text: "Remove student", onclick: async () => {
      if (!armed) { armed = true; removeBtn.textContent = `Click again to remove ${s.name} and all their notes`; setTimeout(() => { armed = false; removeBtn.textContent = "Remove student"; }, 5000); return; }
      removeBtn.disabled = true; removeBtn.textContent = "Removing…";
      try {
        for (const sub of ["updates", "messages"]) {
          const docs = (await F.getDocs(F.collection(db, "students", s.id, sub))).docs;
          await Promise.all(docs.map((d) => F.deleteDoc(F.doc(db, "students", s.id, sub, d.id))));
        }
        await F.deleteDoc(F.doc(db, "students", s.id));
        stopLive(); selectedId = null;
        $("editor").replaceChildren(el("p", { class: "msg ok", text: `${s.name} was removed. (Their family login still exists, so you can add a sibling or re-add them later.)` }));
        await loadTeacher();
      } catch (err) { removeBtn.disabled = false; removeBtn.textContent = friendly(err); }
    } });
    holder.append(editBtn, " ", removeBtn);
    return holder;
  }

  // Reviews waiting for approval (teacher)
  async function loadReviews() {
    const box = $("reviewsBox"); if (!box) return;
    try {
      const snap = await F.getDocs(F.collection(db, "testimonials"));
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.approved === b.approved ? 0 : a.approved ? 1 : -1));
      if (!list.length) { box.replaceChildren(el("p", { class: "empty", text: "No reviews yet. Families can leave one from their dashboard." })); return; }
      box.replaceChildren(...list.map((r) => {
        const set = async (approved) => { try { await F.updateDoc(F.doc(db, "testimonials", r.id), { approved }); loadReviews(); } catch (e) { alert(friendly(e)); } };
        return el("article", { class: "review-row" },
          el("div", {}, el("strong", { text: `${"★".repeat(r.rating || 5)} ${r.name || ""}` }), el("span", { class: "pill " + (r.approved ? "Mastered" : "Needs"), text: r.approved ? "On homepage" : "Waiting" }),
            el("p", { text: r.text || "" })),
          el("div", { class: "row" },
            r.approved ? el("button", { type: "button", class: "btn light small", text: "Hide", onclick: () => set(false) }) : el("button", { type: "button", class: "btn small", text: "Approve", onclick: () => set(true) }),
            el("button", { type: "button", class: "linkbtn danger", text: "Delete", onclick: async () => { try { await F.deleteDoc(F.doc(db, "testimonials", r.id)); loadReviews(); } catch (e) { alert(friendly(e)); } } })));
      }));
    } catch (e) { box.replaceChildren(el("p", { class: "empty", text: "Reviews couldn't load." })); }
  }

  function randomPassword() {
    const a = new Uint8Array(24); crypto.getRandomValues(a);
    return Array.from(a, (b) => b.toString(36).padStart(2, "0")).join("") + "!Aa1";
  }

  $("addStudentForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target, f = new FormData(form), msg = $("addMsg");
    const btn = form.querySelector("button"); btn.disabled = true;
    const email = f.get("email").trim().toLowerCase();
    setMsg(msg, "Adding…", "info");
    try {
      let uid, created = false;
      const fam = await F.getDoc(F.doc(db, "families", email));
      if (fam.exists()) {
        uid = fam.data().uid;
      } else {
        if (!secondary) secondary = A.getAuth(initializeApp(firebaseConfig, "account-creator"));
        try {
          const cred = await A.createUserWithEmailAndPassword(secondary, email, randomPassword());
          uid = cred.user.uid; created = true;
          await A.signOut(secondary);
        } catch (err) {
          if (err.code === "auth/email-already-in-use") throw new Error("That email already has a login that isn't linked to a family here. Use a different email, or delete that user in Firebase → Authentication first.");
          throw err;
        }
        await F.setDoc(F.doc(db, "families", email), { uid, email, createdAt: F.serverTimestamp() });
      }
      const ref = await F.addDoc(F.collection(db, "students"), {
        name: f.get("name").trim(), grade: f.get("grade"), course: f.get("course"),
        familyUid: uid, familyEmail: email, sessions: 0, progress: 0, nextGoal: "", createdAt: F.serverTimestamp(),
      });
      if (created) await A.sendPasswordResetEmail(auth, email);
      form.reset(); selectedId = ref.id; await loadTeacher();
      setMsg(msg, created ? `Added! ${email} was emailed a link to set their password.` : `Added to the existing family account for ${email}.`, "ok");
    } catch (err) {
      setMsg(msg, err.code ? friendly(err) : err.message, "err");
    } finally { btn.disabled = false; }
  });
}
