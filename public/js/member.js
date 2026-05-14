let currentProfile = null;

window.addEventListener("liffReady", async (event) => {
  currentProfile = event.detail;

  document.getElementById("loading").classList.add("hidden");

  const userRef = db.collection("users").doc(currentProfile.userId);
  const userSnap = await userRef.get();

  if (userSnap.exists) {
    window.location.href = "./member.html";
    return;
  }

  document.getElementById("registerBox").classList.remove("hidden");
  document.getElementById("lineName").innerText = currentProfile.displayName;
  document.getElementById("profileImage").src = currentProfile.pictureUrl;
});

async function registerMember() {
  const nickname = document.getElementById("nickname").value.trim();
  const phone = document.getElementById("phone").value.trim();

  if (!nickname || !phone) {
    alert("กรุณากรอกชื่อเล่นและเบอร์โทร");
    return;
  }

  const userId = currentProfile.userId;
  const memberId = "G2-" + Date.now().toString().slice(-6);
  const qrToken = crypto.randomUUID();

  await db.collection("users").doc(userId).set({
    userId,
    memberId,
    displayName: currentProfile.displayName,
    nickname,
    phone,
    pictureUrl: currentProfile.pictureUrl || "",
    role: "member",

    qrToken,
    monthlyPoints: 0,
    lifetimeHours: 0,
    currentRank: "Rookie",
    badges: [],

    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    isActive: true
  });

  alert("สมัครสมาชิกสำเร็จ");
  window.location.href = "./member.html";
}