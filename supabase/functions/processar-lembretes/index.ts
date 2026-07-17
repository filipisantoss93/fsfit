import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import webpush from "npm:web-push@3.6.7";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json" },
});

function nextSchedule(current: string, rrule: string | null) {
  if (!rrule) return null;
  const date = new Date(current);
  if (rrule === "FREQ=DAILY") date.setUTCDate(date.getUTCDate() + 1);
  else if (rrule === "FREQ=WEEKLY") date.setUTCDate(date.getUTCDate() + 7);
  else if (rrule === "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR") {
    do { date.setUTCDate(date.getUTCDate() + 1); } while ([0, 6].includes(date.getUTCDay()));
  } else return null;
  return date.toISOString();
}

function normalizeWhatsAppNumber(value: unknown) {
  const digits = String(value || "").replace(/\D/g, "");
  if (/^55\d{10,11}$/.test(digits)) return digits;
  if (/^\d{10,11}$/.test(digits)) return `55${digits}`;
  return "";
}

async function sendToDevices(admin: any, devices: any[], payload: any) {
  let delivered = 0;
  for (const device of devices || []) {
    try {
      await webpush.sendNotification({
        endpoint: device.endpoint,
        keys: { p256dh: device.p256dh, auth: device.auth_secret },
      }, JSON.stringify(payload));
      delivered++;
      await admin.from("dispositivos_push")
        .update({ ultimo_uso_em: new Date().toISOString() })
        .eq("id", device.id);
    } catch (error: any) {
      const statusCode = Number(error?.statusCode || 0);
      if ([404, 410].includes(statusCode)) {
        await admin.from("dispositivos_push").update({ ativo: false }).eq("id", device.id);
      }
      console.error("Falha Web Push", device.id, statusCode, error?.message);
    }
  }
  return delivered;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: config, error: configError } = await admin
    .from("app_runtime_secrets")
    .select("cron_secret,vapid_public_key,vapid_private_key,vapid_subject")
    .eq("id", 1)
    .single();

  if (configError || !config) return json({ error: "Configuração interna indisponível." }, 503);
  if (!config.cron_secret || req.headers.get("x-cron-secret") !== config.cron_secret) {
    return json({ error: "Não autorizado." }, 401);
  }

  const webPushEnabled = Boolean(config.vapid_public_key && config.vapid_private_key);
  if (webPushEnabled) {
    webpush.setVapidDetails(
      config.vapid_subject || "mailto:contato@fsfit.com.br",
      config.vapid_public_key,
      config.vapid_private_key,
    );
  }

  const now = new Date().toISOString();
  const { data: reminders, error } = await admin.from("lembretes")
    .select("id,personal_id,aluno_id,titulo,mensagem,canal,agendado_para,recorrencia_rrule,tentativas")
    .eq("status", "agendado")
    .in("canal", ["push", "whatsapp", "ambos"])
    .lte("agendado_para", now)
    .order("agendado_para", { ascending: true })
    .limit(100);

  if (error) return json({ error: error.message }, 500);

  let processed = 0;
  let pushSent = 0;
  let whatsappPrepared = 0;

  for (const reminder of reminders || []) {
    processed++;
    const wantsPush = reminder.canal === "push" || reminder.canal === "ambos";
    const wantsWhatsApp = reminder.canal === "whatsapp" || reminder.canal === "ambos";
    const claimStatus = reminder.canal === "whatsapp" ? "processando_whatsapp" : "processando";

    const { data: claimed } = await admin.from("lembretes")
      .update({ status: claimStatus, erro: null })
      .eq("id", reminder.id)
      .eq("status", "agendado")
      .select("id")
      .maybeSingle();

    if (!claimed) continue;

    const errors: string[] = [];
    let pushSuccess = !wantsPush;
    let whatsappSuccess = !wantsWhatsApp;

    if (wantsPush) {
      if (!webPushEnabled) {
        errors.push("Web Push não configurado.");
      } else {
        const { data: studentDevices } = await admin.from("dispositivos_push")
          .select("id,endpoint,p256dh,auth_secret")
          .eq("aluno_id", reminder.aluno_id)
          .eq("ativo", true);

        if (!studentDevices?.length) {
          errors.push("Aluno sem dispositivo com notificações ativas.");
        } else {
          const delivered = await sendToDevices(admin, studentDevices, {
            title: reminder.titulo,
            body: reminder.mensagem,
            url: "/aluno.html",
            tag: `lembrete-${reminder.id}`,
          });
          pushSuccess = delivered > 0;
          if (pushSuccess) pushSent++;
          else errors.push("Não foi possível entregar a notificação Push ao aluno.");
        }
      }
    }

    if (wantsWhatsApp) {
      const { data: student, error: studentError } = await admin.from("alunos")
        .select("id,nome,telefone,personal_id")
        .eq("id", reminder.aluno_id)
        .eq("personal_id", reminder.personal_id)
        .maybeSingle();

      const phone = normalizeWhatsAppNumber(student?.telefone);
      if (studentError || !student) {
        errors.push("Aluno não encontrado para preparar o WhatsApp.");
      } else if (!phone) {
        errors.push("Aluno sem WhatsApp válido cadastrado.");
      } else {
        const internalUrl = `/abrir-whatsapp-lembrete.html?id=${encodeURIComponent(reminder.id)}`;
        const { error: notificationError } = await admin.from("notificacoes").insert({
          destinatario_id: reminder.personal_id,
          destinatario_tipo: "personal",
          remetente_id: reminder.aluno_id,
          remetente_tipo: "aluno",
          tipo: "lembrete_whatsapp",
          titulo: `WhatsApp para ${student.nome || "aluno"}`,
          mensagem: `É hora de enviar “${reminder.titulo}”. Toque para abrir o WhatsApp com a mensagem pronta.`,
          link: internalUrl,
          lida: false,
        });

        if (notificationError) {
          errors.push("Não foi possível criar o aviso de WhatsApp para o personal.");
        } else {
          whatsappSuccess = true;
          whatsappPrepared++;

          if (webPushEnabled) {
            const { data: personalDevices } = await admin.from("dispositivos_push")
              .select("id,endpoint,p256dh,auth_secret")
              .eq("auth_user_id", reminder.personal_id)
              .eq("ativo", true);

            if (personalDevices?.length) {
              await sendToDevices(admin, personalDevices, {
                title: `WhatsApp para ${student.nome || "aluno"}`,
                body: `O lembrete “${reminder.titulo}” está pronto. Toque para abrir a mensagem no WhatsApp.`,
                url: internalUrl,
                tag: `lembrete-whatsapp-${reminder.id}`,
              });
            }
          }
        }
      }
    }

    const allSucceeded = pushSuccess && whatsappSuccess;
    const anySucceeded = (wantsPush && pushSuccess) || (wantsWhatsApp && whatsappSuccess);
    const next = nextSchedule(reminder.agendado_para, reminder.recorrencia_rrule);
    const errorText = errors.length ? errors.join(" ") : null;

    if (next && anySucceeded) {
      await admin.from("lembretes").update({
        status: "agendado",
        agendado_para: next,
        enviado_em: now,
        tentativas: 0,
        erro: allSucceeded ? null : errorText,
      }).eq("id", reminder.id);
      continue;
    }

    if (allSucceeded) {
      await admin.from("lembretes").update({
        status: wantsWhatsApp ? "whatsapp_pendente" : "enviado",
        enviado_em: now,
        tentativas: 0,
        erro: null,
      }).eq("id", reminder.id);
      continue;
    }

    await admin.from("lembretes").update({
      status: anySucceeded ? "falhou_parcial" : "falhou",
      enviado_em: anySucceeded ? now : null,
      tentativas: Number(reminder.tentativas || 0) + 1,
      erro: errorText || "Não foi possível processar o lembrete.",
    }).eq("id", reminder.id);
  }

  return json({ success: true, processed, push_sent: pushSent, whatsapp_prepared: whatsappPrepared });
});
