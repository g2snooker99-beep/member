import os, sys

BASE   = "/workspaces/member"
PUBLIC = os.path.join(BASE, "public")
results = []

def write(relpath, content, label):
    path = os.path.join(PUBLIC, relpath)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content.strip() + "\n")
    results.append(f"✅  {label:<42} {os.path.getsize(path):>7,} bytes")

FIREBASE_CONFIG = '''const firebaseConfig = {
  apiKey: "AIzaSyACqncCy4JRWZzbKkqLAzcjluQQeF6j2Yg",
  authDomain: "member-3e17e.firebaseapp.com",
  projectId: "member-3e17e",
  storageBucket: "member-3e17e.firebasestorage.app",
  messagingSenderId: "208783795329",
  appId: "1:208783795329:web:0cb511d8ce5cd3e5209980",
  measurementId: "G-2WY6SMT03N"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();'''

LIFF_INIT = '''// Member LIFF — used by index.html only.
const LIFF_ID = "2010084269-aui1GaWz";
let lineProfile = null;
async function initLiff() {
  try {
    await liff.init({ liffId: LIFF_ID });
    if (!liff.isLoggedIn()) { liff.login(); return; }
    lineProfile = await liff.getProfile();
    window.dispatchEvent(new CustomEvent("liffReady", { detail: lineProfile }));
  } catch (error) {
    console.error("LIFF init error:", error);
    alert("เปิดระบบ LINE ไม่สำเร็จ");
  }
}
initLiff();'''

MEMBER_HTML = '''<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8"/>
  <title>G2 Member</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <link rel="stylesheet" href="./css/style.css"/>
  <script src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>
  <script src="https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore-compat.js"></script>
</head>
<body>
<div class="page">
  <div class="member-card">
    <div class="top">
      <div>
        <h1 style="font-size:20px;margin:0;">G2 SNOOKER</h1>
        <p style="margin:4px 0 0;color:#9fe8c0;font-size:13px;">LINE Member</p>
      </div>
      <div id="rankBadge">–</div>
    </div>
    <div id="loading" style="text-align:center;padding:40px 0;">กำลังโหลด…</div>
    <div id="content" class="hidden">
      <div class="profile">
        <img id="avatar" class="avatar"/>
        <div>
          <h2 id="displayName" style="margin:0;"></h2>
          <p id="memberId" style="margin:4px 0 0;color:#9fe8c0;font-size:13px;"></p>
        </div>
      </div>
      <div class="stats">
        <div><b id="monthlyPoints">0</b><span>แต้มเดือนนี้</span></div>
        <div><b id="lifetimeHours">0</b><span>ชั่วโมงสะสม</span></div>
      </div>
      <button onclick="window.location.href=\'./qr.html\'" style="margin-top:18px;">📱 แสดง QR Code</button>
      <button class="secondary" onclick="window.location.href=\'./leaderboard.html\'" style="margin-top:10px;">🏆 อันดับเดือนนี้</button>
    </div>
  </div>
</div>
<script src="./js/firebase-config.js"></script>
<script>
  const MEMBER_LIFF = "2010084269-aui1GaWz";
  async function init() {
    await liff.init({ liffId: MEMBER_LIFF });
    if (!liff.isLoggedIn()) { liff.login(); return; }
    const profile = await liff.getProfile();
    db.collection("users").doc(profile.userId).onSnapshot(snap => {
      if (!snap.exists) { window.location.href = "./index.html"; return; }
      const d = snap.data();
      document.getElementById("loading").classList.add("hidden");
      document.getElementById("content").classList.remove("hidden");
      document.getElementById("avatar").src               = d.pictureUrl || "";
      document.getElementById("displayName").textContent  = d.nickname || d.displayName;
      document.getElementById("memberId").textContent     = "รหัสสมาชิก: " + (d.memberId || "");
      document.getElementById("monthlyPoints").textContent = d.monthlyPoints || 0;
      document.getElementById("lifetimeHours").textContent = (d.lifetimeHours || 0) + " h";
      document.getElementById("rankBadge").textContent    = d.currentRank || "Rookie";
    }, err => console.error(err));
  }
  init().catch(e => { console.error(e); alert("เกิดข้อผิดพลาด"); });
</script>
</body>
</html>'''

QR_HTML = '''<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8"/>
  <title>G2 QR Code</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <link rel="stylesheet" href="./css/style.css"/>
  <script src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>
  <script src="https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore-compat.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
  <style>
    #pointsDisplay {
      font-size: 54px; font-weight: 900; color: #48f08d; line-height: 1;
      transition: transform 0.35s cubic-bezier(.36,1.7,.64,1), color 0.25s;
    }
    #pointsDisplay.bump { transform: scale(1.4); color: #b6ff6d; }
    #notifBanner {
      margin-top: 14px; padding: 14px 20px; border-radius: 18px;
      background: rgba(45,224,128,0.18); border: 1px solid rgba(45,224,128,0.4);
      color: #b9ffd4; font-size: 18px; font-weight: 800;
      opacity: 0; transform: translateY(10px) scale(0.96);
      transition: opacity 0.3s ease, transform 0.3s ease; pointer-events: none;
    }
    #notifBanner.show { opacity: 1; transform: translateY(0) scale(1); }
    #qrWrap { margin: 16px auto; display: inline-block; background: #fff; padding: 14px; border-radius: 20px; }
  </style>
</head>
<body>
<div class="page">
  <div class="card center">
    <h1>G2 SNOOKER</h1>
    <p class="sub">บัตรสมาชิก</p>
    <div id="loading" style="padding:40px 0;">กำลังโหลด…</div>
    <div id="content" class="hidden">
      <img id="avatar" class="avatar"/>
      <h2 id="displayName"></h2>
      <p id="memberId" style="color:#9fe8c0;font-size:13px;margin:0 0 4px;"></p>
      <p id="rankLabel" style="color:#ffd166;font-size:14px;font-weight:700;margin:0 0 16px;"></p>
      <div id="qrWrap"><div id="qrcode"></div></div>
      <p style="color:#5d7a65;font-size:12px;margin:6px 0 20px;">ให้พนักงานสแกน QR นี้เพื่อเพิ่มแต้ม</p>
      <div style="background:rgba(255,255,255,0.07);border-radius:22px;padding:20px 24px;">
        <div id="pointsDisplay">0</div>
        <p style="margin:6px 0 0;color:#9fe8c0;font-size:14px;">แต้มเดือนนี้</p>
      </div>
      <div id="notifBanner">🎉 ยินดีด้วย!</div>
      <button class="secondary" onclick="window.location.href=\'./member.html\'" style="margin-top:20px;">← กลับหน้าหลัก</button>
    </div>
  </div>
</div>
<script src="./js/firebase-config.js"></script>
<script>
  const MEMBER_LIFF = "2010084269-aui1GaWz";
  let prevPoints = null, qrGenerated = false, notifTimer = null;

  async function init() {
    await liff.init({ liffId: MEMBER_LIFF });
    if (!liff.isLoggedIn()) { liff.login(); return; }
    const profile = await liff.getProfile();
    listenUser(profile.userId);
  }

  function listenUser(userId) {
    db.collection("users").doc(userId).onSnapshot(snap => {
      if (!snap.exists) { alert("ไม่พบข้อมูลสมาชิก"); window.location.href="./index.html"; return; }
      const d = snap.data();
      const newPoints = d.monthlyPoints || 0;
      if (prevPoints === null) {
        document.getElementById("loading").classList.add("hidden");
        document.getElementById("content").classList.remove("hidden");
        document.getElementById("avatar").src              = d.pictureUrl || "";
        document.getElementById("displayName").textContent = d.nickname || d.displayName;
        document.getElementById("memberId").textContent    = "รหัสสมาชิก: " + (d.memberId || "");
        document.getElementById("rankLabel").textContent   = "🏅 " + (d.currentRank || "Rookie");
        if (!qrGenerated) {
          new QRCode(document.getElementById("qrcode"), {
            text: d.qrToken || userId, width: 200, height: 200,
            colorDark: "#0a120c", colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.H
          });
          qrGenerated = true;
        }
      }
      document.getElementById("pointsDisplay").textContent = newPoints;
      if (prevPoints !== null && newPoints > prevPoints) {
        showNotif("🎉 ได้รับ +" + (newPoints - prevPoints) + " แต้ม! ยินดีด้วย!");
        bumpCounter();
      }
      prevPoints = newPoints;
    }, err => console.error("onSnapshot error:", err));
  }

  function showNotif(msg) {
    const el = document.getElementById("notifBanner");
    el.textContent = msg; el.classList.add("show");
    clearTimeout(notifTimer);
    notifTimer = setTimeout(() => el.classList.remove("show"), 4500);
  }
  function bumpCounter() {
    const el = document.getElementById("pointsDisplay");
    el.classList.remove("bump"); void el.offsetWidth;
    el.classList.add("bump"); setTimeout(() => el.classList.remove("bump"), 400);
  }
  init().catch(e => { console.error(e); alert("เกิดข้อผิดพลาด"); });
</script>
</body>
</html>'''

STAFF_SCAN_HTML = '''<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8"/>
  <title>G2 Staff – สแกน QR</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <link rel="stylesheet" href="./css/style.css"/>
  <script src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>
  <script src="https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore-compat.js"></script>
  <script src="https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js"></script>
  <style>#reader{width:100%;border-radius:16px;overflow:hidden;margin:16px 0;}</style>
</head>
<body>
<div class="page"><div class="card center">
  <h1>G2 SNOOKER</h1>
  <p class="sub">Staff – สแกน QR สมาชิก</p>
  <div id="loading" style="padding:40px 0;">กำลังโหลด…</div>
  <div id="content" class="hidden">
    <div id="reader"></div>
    <p id="statusMsg" style="color:#9fe8c0;font-size:14px;min-height:20px;"></p>
    <button class="secondary" onclick="window.location.href=\'./staff-add-points.html\'">✍️ ป้อนรหัสด้วยตัวเอง</button>
  </div>
  <div id="accessDenied" class="hidden" style="padding:20px;color:#ff7070;">⛔ คุณไม่มีสิทธิ์เข้าถึงหน้านี้</div>
</div></div>
<script src="./js/firebase-config.js"></script>
<script>
  const STAFF_LIFF = "2010084269-Mv2yEosd";
  let scanner = null;
  async function init() {
    await liff.init({ liffId: STAFF_LIFF });
    if (!liff.isLoggedIn()) { liff.login(); return; }
    const profile = await liff.getProfile();
    const snap = await db.collection("users").doc(profile.userId).get();
    if (!snap.exists || !["staff","admin"].includes(snap.data().role)) {
      document.getElementById("loading").classList.add("hidden");
      document.getElementById("accessDenied").classList.remove("hidden");
      return;
    }
    document.getElementById("loading").classList.add("hidden");
    document.getElementById("content").classList.remove("hidden");
    scanner = new Html5QrcodeScanner("reader",{fps:10,qrbox:{width:240,height:240}},false);
    scanner.render(text => {
      scanner.clear().catch(()=>{});
      document.getElementById("statusMsg").textContent = "✅ สแกนสำเร็จ กำลังโหลด…";
      window.location.href = "./staff-add-points.html?qrToken=" + encodeURIComponent(text);
    }, ()=>{});
  }
  init().catch(e => { console.error(e); alert("เกิดข้อผิดพลาด"); });
</script>
</body>
</html>'''

STAFF_ADD_HTML = '''<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8"/>
  <title>G2 Staff – เพิ่มแต้ม</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <link rel="stylesheet" href="./css/style.css"/>
  <script src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>
  <script src="https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore-compat.js"></script>
  <style>
    .pt-btn{padding:18px 0;border-radius:16px;border:none;background:rgba(45,224,128,0.14);
      color:#48f08d;font-size:22px;font-weight:900;cursor:pointer;transition:background .15s,transform .12s;}
    .pt-btn:active{transform:scale(0.92);} .pt-btn:hover{background:rgba(45,224,128,0.28);}
    .pt-btn:disabled{opacity:.4;pointer-events:none;}
    #memberCard{display:flex;gap:14px;align-items:center;background:rgba(255,255,255,0.07);
      border-radius:20px;padding:16px;margin:14px 0;}
    #memberCard .info p{margin:3px 0;font-size:13px;color:#9fe8c0;}
    #successMsg{margin-top:12px;padding:14px;border-radius:16px;background:rgba(45,224,128,0.15);
      color:#b9ffd4;font-weight:700;display:none;font-size:15px;}
  </style>
</head>
<body>
<div class="page"><div class="card">
  <h1 style="font-size:20px;text-align:center;">G2 SNOOKER</h1>
  <p class="sub" style="text-align:center;">Staff – เพิ่มแต้มสมาชิก</p>
  <div id="loading" style="text-align:center;padding:30px 0;">กำลังโหลด…</div>
  <div id="accessDenied" class="hidden" style="text-align:center;color:#ff7070;padding:20px;">⛔ คุณไม่มีสิทธิ์เข้าถึงหน้านี้</div>
  <div id="content" class="hidden">
    <div id="searchBox">
      <p style="color:#9fe8c0;font-size:14px;margin:0 0 8px;">ป้อน qrToken หรือรหัสสมาชิก</p>
      <input id="tokenInput" placeholder="วางหรือพิมพ์รหัสที่นี่" style="margin-top:0;"/>
      <button onclick="lookupMember()">🔍 ค้นหาสมาชิก</button>
      <button class="secondary" onclick="window.location.href=\'./staff-scan.html\'" style="margin-top:8px;">📷 สแกน QR แทน</button>
    </div>
    <div id="memberCard" class="hidden">
      <img id="mAvatar" class="avatar" style="width:54px;height:54px;flex-shrink:0;"/>
      <div class="info">
        <b id="mName">–</b>
        <p id="mMemberId">–</p>
        <p id="mCurrentPoints" style="color:#ffd166;font-weight:700;">แต้มเดือนนี้: –</p>
      </div>
    </div>
    <div id="pointButtons" class="hidden">
      <p style="color:#9fe8c0;font-size:14px;margin:4px 0 10px;">เลือกจำนวนแต้มที่จะเพิ่ม</p>
      <div class="point-buttons">
        <button class="pt-btn" onclick="addPoints(1)">+1</button>
        <button class="pt-btn" onclick="addPoints(2)">+2</button>
        <button class="pt-btn" onclick="addPoints(3)">+3</button>
        <button class="pt-btn" onclick="addPoints(5)">+5</button>
        <button class="pt-btn" onclick="addPoints(10)">+10</button>
        <button class="pt-btn" onclick="addPoints(15)">+15</button>
        <button class="pt-btn" onclick="addPoints(20)">+20</button>
        <button class="pt-btn" onclick="addPoints(30)">+30</button>
      </div>
      <div id="successMsg"></div>
      <button class="secondary" onclick="resetForm()" style="margin-top:12px;">🔄 เพิ่มให้สมาชิกคนอื่น</button>
    </div>
  </div>
</div></div>
<script src="./js/firebase-config.js"></script>
<script>
  const STAFF_LIFF = "2010084269-Mv2yEosd";
  let staffProfile = null, memberDocId = null, memberData = null;

  async function init() {
    await liff.init({ liffId: STAFF_LIFF });
    if (!liff.isLoggedIn()) { liff.login(); return; }
    staffProfile = await liff.getProfile();
    const staffSnap = await db.collection("users").doc(staffProfile.userId).get();
    if (!staffSnap.exists || !["staff","admin"].includes(staffSnap.data().role)) {
      document.getElementById("loading").classList.add("hidden");
      document.getElementById("accessDenied").classList.remove("hidden");
      return;
    }
    document.getElementById("loading").classList.add("hidden");
    document.getElementById("content").classList.remove("hidden");
    const qrToken = new URLSearchParams(window.location.search).get("qrToken");
    if (qrToken) { document.getElementById("tokenInput").value = qrToken; await lookupMember(); }
  }

  async function lookupMember() {
    const token = document.getElementById("tokenInput").value.trim();
    if (!token) { alert("กรุณากรอกรหัส"); return; }
    let snap = await db.collection("users").where("qrToken","==",token).limit(1).get();
    if (snap.empty) snap = await db.collection("users").where("memberId","==",token).limit(1).get();
    if (snap.empty) { alert("ไม่พบสมาชิก"); return; }
    const doc = snap.docs[0];
    memberDocId = doc.id; memberData = doc.data();
    document.getElementById("mAvatar").src           = memberData.pictureUrl || "";
    document.getElementById("mName").textContent     = memberData.nickname || memberData.displayName;
    document.getElementById("mMemberId").textContent = "รหัส: " + (memberData.memberId || "");
    document.getElementById("mCurrentPoints").textContent = "แต้มเดือนนี้: " + (memberData.monthlyPoints || 0);
    document.getElementById("memberCard").classList.remove("hidden");
    document.getElementById("pointButtons").classList.remove("hidden");
    document.getElementById("searchBox").classList.add("hidden");
  }

  async function addPoints(amount) {
    if (!memberDocId) return;
    document.querySelectorAll(".pt-btn").forEach(b => b.disabled = true);
    try {
      const batch = db.batch();
      batch.update(db.collection("users").doc(memberDocId), {
        monthlyPoints: firebase.firestore.FieldValue.increment(amount),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      batch.set(db.collection("pointTransactions").doc(), {
        userId: memberDocId, memberId: memberData.memberId || "",
        staffId: staffProfile.userId, points: amount, type: "add",
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      await batch.commit();
      memberData.monthlyPoints = (memberData.monthlyPoints || 0) + amount;
      document.getElementById("mCurrentPoints").textContent = "แต้มเดือนนี้: " + memberData.monthlyPoints;
      const msg = document.getElementById("successMsg");
      msg.textContent = "✅ เพิ่ม +" + amount + " แต้มสำเร็จ!  รวม " + memberData.monthlyPoints + " แต้ม";
      msg.style.display = "block";
      setTimeout(() => { msg.style.display = "none"; }, 3500);
    } catch(e) { console.error(e); alert("เกิดข้อผิดพลาด: " + e.message); }
    finally { document.querySelectorAll(".pt-btn").forEach(b => b.disabled = false); }
  }

  function resetForm() {
    memberDocId = memberData = null;
    document.getElementById("tokenInput").value = "";
    document.getElementById("memberCard").classList.add("hidden");
    document.getElementById("pointButtons").classList.add("hidden");
    document.getElementById("searchBox").classList.remove("hidden");
    document.getElementById("successMsg").style.display = "none";
    history.replaceState({}, "", "./staff-add-points.html");
  }

  init().catch(e => { console.error(e); alert("เกิดข้อผิดพลาด"); });
</script>
</body>
</html>'''

LEADERBOARD_HTML = '''<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8"/>
  <title>G2 – อันดับเดือนนี้</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <link rel="stylesheet" href="./css/style.css"/>
  <script src="https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore-compat.js"></script>
</head>
<body>
<div class="page"><div class="card">
  <h1 style="text-align:center;font-size:22px;">🏆 อันดับเดือนนี้</h1>
  <p class="sub" style="text-align:center;">G2 Snooker Monthly Points</p>
  <div id="loading" style="text-align:center;padding:30px 0;">กำลังโหลด…</div>
  <div id="list"></div>
  <button class="secondary" onclick="history.back()" style="margin-top:16px;width:100%;">← กลับ</button>
</div></div>
<script src="./js/firebase-config.js"></script>
<script>
  const MEDALS = ["🥇","🥈","🥉"];
  async function load() {
    const snap = await db.collection("users").where("isActive","==",true)
      .orderBy("monthlyPoints","desc").limit(20).get();
    document.getElementById("loading").classList.add("hidden");
    const list = document.getElementById("list");
    if (snap.empty) { list.innerHTML=\'<p style="text-align:center;color:#9fe8c0;padding:20px;">ยังไม่มีข้อมูล</p>\'; return; }
    snap.docs.forEach((doc, i) => {
      const d = doc.data(), row = document.createElement("div");
      row.className = "leader-row" + (i < 3 ? " top3" : "");
      row.innerHTML = `<span style="font-size:20px;text-align:center;">${MEDALS[i]||(i+1)}</span>
        <img src="${d.pictureUrl||""}" onerror="this.style.visibility=\'hidden\'" style="width:42px;height:42px;border-radius:50%;object-fit:cover;"/>
        <div><b>${d.nickname||d.displayName||"–"}</b><p>${d.memberId||""}</p></div>
        <strong>${d.monthlyPoints||0}</strong>`;
      list.appendChild(row);
    });
  }
  load().catch(e => { document.getElementById("loading").textContent="โหลดไม่ได้"; });
</script>
</body>
</html>'''

write("js/firebase-config.js", FIREBASE_CONFIG, "js/firebase-config.js  fix encoding")
write("js/liff-init.js",       LIFF_INIT,       "js/liff-init.js        set LIFF ID")
write("member.html",           MEMBER_HTML,      "member.html")
write("qr.html",               QR_HTML,          "qr.html  onSnapshot fix")
write("staff-scan.html",       STAFF_SCAN_HTML,  "staff-scan.html")
write("staff-add-points.html", STAFF_ADD_HTML,   "staff-add-points.html")
write("leaderboard.html",      LEADERBOARD_HTML, "leaderboard.html")

print()
for r in results: print(r)
ok = sum(1 for r in results if r.startswith("✅"))
print(f"\n{'='*55}")
print(f"✅  {ok}/{len(results)} files written" if ok==len(results) else f"❌  errors!")
