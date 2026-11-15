// Apex Tutoring portal: Firebase Auth (email/password) + Firestore.
// Data model:
//   teachers/{uid}               → { name }                       (added by hand in the console)
//   families/{email}             → { uid, email }                 (teacher-only)
//   students/{id}                → { name, grade, course, familyUid, familyEmail, sessions, progress, nextGoal }
//   students/{id}/updates/{id}   → { topic, status, note, goal, createdAt }
import { firebaseConfig } from "./firebase-config.js";

const SDK = "https://www.gstatic.com/firebasejs/10.12.2/";
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
    try { await A.signInWithEmailAndPassword(auth, $("loginEmail").value.trim(), $("loginPassword").value); }
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
    if (!user) { $("loginForm").reset(); return show("loginView"); }
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
  function updatesList(updates) {
    if (!updates.length) return el("p", { class: "empty", text: "No session notes yet." });
    return el("div", { class: "updates" }, updates.map((u) =>
      el("article", {},
        el("strong", { text: u.topic || "Session" }), u.status ? el("span", { class: pillClass(u.status), text: u.status }) : null,
        el("time", { text: "  " + fmtDate(u.createdAt) }),
        u.note ? el("p", { text: u.note }) : null)));
  }
  function progressBlock(s, updates) {
    const t = topicSummary(updates);
    const pct = Math.max(0, Math.min(100, Number(s.progress) || 0));
    return [
      el("div", { class: "stats" },
        el("div", { class: "stat" }, el("strong", { text: String(s.sessions || 0) }), el("span", { text: "Sessions completed" })),
        el("div", { class: "stat" }, el("strong", { text: String(t.covered) }), el("span", { text: "Topics covered" })),
        el("div", { class: "stat" }, el("strong", { text: String(t.mastered) }), el("span", { text: "Topics mastered" }))),
      el("strong", { style: "color:var(--navy)", text: `${s.grade || ""} progress · ${pct}%` }),
      el("div", { class: "bar" }, el("span", { style: `width:${pct}%` })),
      s.nextGoal ? el("div", { class: "goal" }, el("strong", { text: "Next goal: " }), s.nextGoal) : null,
    ];
  }

  // ---------- Family view ----------
  async function loadFamily(user) {
    const box = $("familyStudents");
    box.replaceChildren();
    const snap = await F.getDocs(F.query(F.collection(db, "students"), F.where("familyUid", "==", user.uid)));
    if (snap.empty) { box.append(el("div", { class: "card" }, el("p", { class: "empty", text: "Your tutor hasn't added your student profile yet. Check back after your first session." }))); return; }
    for (const d of snap.docs) {
      const s = d.data();
      const updates = await getUpdates(d.id);
      box.append(el("article", { class: "card" },
        el("h2", { text: s.name }), el("p", { class: "muted", style: "margin:0", text: `${s.grade} · ${s.course}` }),
        progressBlock(s, updates),
        el("h3", { style: "margin-top:16px", text: "Tutor updates" }), updatesList(updates)));
    }
  }

  // ---------- Teacher view ----------
  let students = [];
  let selectedId = null;

  async function loadTeacher() {
    const snap = await F.getDocs(F.query(F.collection(db, "students"), F.orderBy("name")));
    students = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderList();
    if (selectedId && students.some((s) => s.id === selectedId)) await openStudent(selectedId);
  }
  function renderList() {
    const ul = $("studentList");
    ul.replaceChildren();
    if (!students.length) { ul.append(el("li", { class: "empty", text: "No students yet. Add one below." })); return; }
    students.forEach((s) => ul.append(el("li", {},
      el("button", { type: "button", class: s.id === selectedId ? "active" : "", onclick: () => openStudent(s.id, true) },
        el("strong", { text: s.name }), el("small", { text: `${s.grade} · ${s.familyEmail}` })))));
  }

  async function openStudent(id, scroll = false) {
    selectedId = id; renderList();
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

    const form = el("form", { class: "form-grid" },
      el("label", {}, "Topic", el("input", { name: "topic", required: "", maxlength: "60", placeholder: "e.g. Long division" })),
      el("label", {}, "Status", el("select", { name: "status" }, ["Practicing", "Mastered", "Needs review"].map((o) => el("option", { text: o })))),
      el("label", { class: "full" }, "Session note", el("textarea", { name: "note", maxlength: "600", placeholder: "What did they work on? What went well?" })),
      el("label", { class: "full" }, "Next goal (optional)", el("input", { name: "goal", maxlength: "160", value: s.nextGoal || "" })),
      el("label", { class: "check full" }, el("input", { type: "checkbox", name: "counts", checked: "" }), "Count this as a completed session"),
      el("button", { class: "btn full", type: "submit", text: "Add update" }), msg);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = new FormData(form);
      const btn = form.querySelector("button[type=submit]"); btn.disabled = true;
      try {
        await F.addDoc(F.collection(db, "students", id, "updates"), {
          topic: f.get("topic").trim(), status: f.get("status"), note: f.get("note").trim(), goal: f.get("goal").trim(), createdAt: F.serverTimestamp(),
        });
        const patch = { nextGoal: f.get("goal").trim(), lastSession: F.serverTimestamp() };
        if (f.get("counts")) patch.sessions = F.increment(1);
        await F.updateDoc(F.doc(db, "students", id), patch);
        await loadTeacher();
        setMsg($("editor").querySelector(".msg"), "Update added. The family can see it now.", "ok");
      } catch (err) { setMsg(msg, friendly(err), "err"); btn.disabled = false; }
    });

    ed.replaceChildren(
      el("h2", { text: s.name }), el("p", { class: "muted", style: "margin:0", text: `${s.grade} · ${s.course} · ${s.familyEmail}` }), resend,
      ...progressBlock(s, updates),
      el("div", { class: "row" }, el("strong", { style: "color:var(--navy)", text: "Course progress %" }), progressInput, saveProgress),
      el("h3", { style: "margin-top:20px", text: "Log a session" }), form,
      el("h3", { style: "margin-top:20px", text: "Past updates" }), updatesList(updates));
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
