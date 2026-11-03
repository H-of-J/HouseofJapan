import { deletionConfig } from "./deletion-config.mjs";

const byId = (id) => document.getElementById(id);
const ui = Object.fromEntries(["action-card", "status", "start", "confirmation", "account-email", "consent", "delete", "cancel", "retry", "google-button", "action-heading", "step-label"].map(id => [id, byId(id)]));
let credential = null;
let busy = false;
let expires = null;
let googleReady = false;

function status(message, state = "info") {
  ui.status.textContent = message;
  ui.status.dataset.state = state;
}
function setBusy(value) {
  busy = value;
  ui["action-card"].setAttribute("aria-busy", String(value));
  ui.delete.disabled = value || !ui.consent.checked || !credential;
  ui.cancel.disabled = value;
  ui.start.disabled = value;
  ui.retry.disabled = value;
}
function clearIdentity() {
  clearTimeout(expires);
  credential = null;
  ui["account-email"].textContent = "";
  ui.consent.checked = false;
  ui.confirmation.hidden = true;
  ui.delete.disabled = true;
}

export async function callDeletion(name, data = {}, fetcher = fetch) {
  const response = await fetcher(`${deletionConfig.functionsOrigin}/${name}`, {
    method: "POST", mode: "cors", credentials: "omit", cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data }), signal: AbortSignal.timeout(180000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.error || !body.result) {
    const error = new Error("削除処理を完了できませんでした。");
    error.code = body.error?.status || "UNAVAILABLE";
    throw error;
  }
  return body.result;
}

function errorMessage(error) {
  if (error.code === "UNAUTHENTICATED") return "本人確認の有効期限が切れました。もう一度Googleで本人確認してください。";
  if (error.code === "NOT_FOUND") return "このGoogleアカウントに連携したPONZUのアカウントは見つかりません。別のアカウントで確認できます。";
  return "処理を完了できませんでした。途中まで削除された可能性があります。通信状況を確認し、もう一度本人確認して再試行してください。";
}

async function onCredential(result) {
  if (busy || !result?.credential) return;
  clearIdentity();
  setBusy(true);
  status("PONZUの連携情報を確認しています。まだ削除は実行していません。");
  try {
    const account = await callDeletion("getPonzuDeletionAccount", { googleIdToken: result.credential });
    if (account.alreadyDeleted) {
      status("このアカウントのPONZU連携情報は削除済みです。", "success");
      ui["google-button"].hidden = true;
      return;
    }
    if (!account.email) throw new Error("Invalid account response");
    credential = result.credential;
    ui["account-email"].textContent = account.email;
    ui.confirmation.hidden = false;
    ui["google-button"].hidden = true;
    status("削除するアカウントと、上記の削除内容を確認してください。");
    expires = setTimeout(() => {
      if (busy) return;
      clearIdentity();
      ui["google-button"].hidden = false;
      status("本人確認の有効期限が切れました。もう一度Googleで本人確認してください。", "error");
    }, 4 * 60 * 1000);
  } catch (error) {
    clearIdentity();
    ui["google-button"].hidden = false;
    status(errorMessage(error), "error");
  } finally { setBusy(false); }
}

async function loadGoogle() {
  if (googleReady) return;
  await new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = resolve;
    script.onerror = reject;
    document.head.append(script);
  });
  window.google.accounts.id.initialize({
    client_id: deletionConfig.googleClientId,
    callback: onCredential,
    auto_select: false,
    ux_mode: "popup",
  });
  window.google.accounts.id.renderButton(ui["google-button"], {
    type: "standard", theme: "outline", size: "large", text: "continue_with", locale: "ja", width: 260,
  });
  googleReady = true;
}

ui.start.addEventListener("click", async () => {
  if (busy) return;
  setBusy(true);
  try {
    await loadGoogle();
    ui.start.hidden = true;
    ui["google-button"].hidden = false;
    status("Googleのボタンから、PONZUで使用したアカウントを選択してください。");
  } catch {
    status("Googleの本人確認画面を読み込めませんでした。通信状況を確認して再試行してください。", "error");
  } finally { setBusy(false); }
});

ui.consent.addEventListener("change", () => { ui.delete.disabled = busy || !ui.consent.checked || !credential; });
ui.cancel.addEventListener("click", () => {
  if (busy) return;
  clearIdentity();
  ui["google-button"].hidden = false;
  status("キャンセルしました。削除は実行していません。");
});
ui.confirmation.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (busy || !credential || !ui.consent.checked) return;
  clearTimeout(expires);
  setBusy(true);
  status("Google連携を解除し、PONZUの情報を削除しています。このままお待ちください。");
  try {
    const result = await callDeletion("deletePonzuAccount", { googleIdToken: credential, confirmed: true });
    if (result.deleted !== true) throw new Error("Deletion was not confirmed");
    clearIdentity();
    ui["google-button"].hidden = true;
    ui.start.hidden = true;
    ui["action-heading"].textContent = "Google連携を解除しました";
    ui["step-label"].textContent = "完了";
    status("PONZUのアカウント情報と関連する紹介履歴を削除しました。\nGoogleアカウント、端末の録音、Google Playの定期購入はそのままです。", "success");
  } catch (error) {
    clearIdentity();
    ui["google-button"].hidden = false;
    status(errorMessage(error), "error");
  } finally { setBusy(false); }
});

async function initialize() {
  clearIdentity();
  ui.start.hidden = false;
  ui["google-button"].hidden = true;
  ui.retry.hidden = true;
  setBusy(true);
  if (!deletionConfig.enabled) {
    status("現在、Google連携解除の受付を準備しています。\nこのページからの本人確認・削除はまだ利用できません。", "unavailable");
    setBusy(false);
    ui.start.disabled = true;
    return;
  }
  try {
    const result = await callDeletion("ponzuDeletionStatus");
    if (result.available !== true || result.projectId !== deletionConfig.projectId || result.version !== 1) throw new Error("Not ready");
    status("本人確認をしてから、削除内容を確認できます。");
    setBusy(false);
  } catch {
    setBusy(false);
    ui.start.disabled = true;
    ui.retry.hidden = false;
    status("現在、削除の受付に接続できません。時間をおいて再度お試しください。削除は実行されていません。", "unavailable");
  }
}
ui.retry.addEventListener("click", initialize);
window.addEventListener("pagehide", clearIdentity);
initialize();
