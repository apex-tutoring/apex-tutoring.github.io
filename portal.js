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
  function updateBody(u) {
    const link = safeUrl(u.homeworkLink || "");
    return [
      el("strong", { text: u.topic || "Session" }), u.status ? el("span", { class: pillClass(u.status), text: u.status }) : null,
      el("time", { text: "  " + fmtDate(u.createdAt) }),
      u.note ? el("p", { text: u.note }) : null,
      u.homework || link ? el("div", { class: "hw" }, el("strong", { text: "📝 Practice: " }), u.homework || "",
        link ? el("a", { href: link, target: "_blank", rel: "noopener noreferrer", text: (u.homework ? " · " : "") + "Open worksheet ↗" }) : null) : null,
    ];
  }
  // opts.studentId turns on the teacher's Edit / Delete buttons.
  function updatesList(updates, opts = {}) {
    if (!updates.length) return el("p", { class: "empty", text: "No session notes yet." });
    return el("div", { class: "updates" }, updates.map((u) => {
      const art = el("article", {}, updateBody(u));
      if (opts.studentId) art.append(noteActions(opts.studentId, u, art));
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
        el("label", { class: "full" }, "Worksheet link", el("input", { name: "homeworkLink", type: "url", maxlength: "400", value: u.homeworkLink || "", placeholder: "https://…" })),
        el("div", { class: "row full" }, el("button", { class: "btn small", type: "submit", text: "Save changes" }),
          el("button", { class: "btn light small", type: "button", text: "Cancel", onclick: () => art.replaceChildren(...updateBody(u), noteActions(studentId, u, art)) })));
      f.addEventListener("submit", async (e) => {
        e.preventDefault(); const d = new FormData(f);
        const link = d.get("homeworkLink").trim();
        if (link && !safeUrl(link)) { alertMsg(f, "Links must start with https://"); return; }
        try {
          await F.updateDoc(ref, { topic: d.get("topic").trim(), status: d.get("status"), note: d.get("note").trim(), homework: d.get("homework").trim(), homeworkLink: link });
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
        el("h2", { text: s.name }), el("p", { class: "muted", style: "margin:0", text: `${s.grade} · ${s.course}` }),
        progressBlock(s, updates),
        el("h3", { style: "margin-top:16px", text: "💬 Messages with your tutor" }), messageThread({ id: d.id, ...s }, "family"),
        el("h3", { style: "margin-top:20px", text: "Tutor updates" }), updatesList(updates)));
    }
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
    loadStats();
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
      el("label", { class: "full" }, "Worksheet link (optional)", el("input", { name: "homeworkLink", type: "url", maxlength: "400", placeholder: "https://…" })),
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
          homework: f.get("homework").trim(), homeworkLink: link, createdAt: F.serverTimestamp(),
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
      el("h2", { text: s.name }), el("p", { class: "muted", style: "margin:0", text: `${s.grade} · ${s.course} · ${s.familyEmail}` }), resend,
      ...progressBlock(s, updates),
      el("div", { class: "row" }, el("strong", { style: "color:var(--navy)", text: "Course progress %" }), progressInput, saveProgress),
      el("h3", { style: "margin-top:20px", text: "Next session" }), nsForm,
      el("h3", { style: "margin-top:20px", text: "Log a session" }), form,
      el("h3", { style: "margin-top:20px", text: "💬 Messages" }), messageThread(s, "teacher"),
      el("h3", { style: "margin-top:20px", text: "Past updates" }), updatesList(updates, { studentId: id }));
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
