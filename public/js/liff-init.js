const LIFF_ID = "YOUR_LIFF_ID";

let lineProfile = null;

async function initLiff() {
  try {
    await liff.init({ liffId: LIFF_ID });

    if (!liff.isLoggedIn()) {
      liff.login();
      return;
    }

    lineProfile = await liff.getProfile();

    window.dispatchEvent(new CustomEvent("liffReady", {
      detail: lineProfile
    }));

  } catch (error) {
    console.error("LIFF init error:", error);
    alert("เปิดระบบ LINE ไม่สำเร็จ");
  }
}

initLiff();