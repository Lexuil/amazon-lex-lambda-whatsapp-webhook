import { gunzipSync } from 'zlib'
import { Buffer } from 'buffer'
import { LexRuntimeV2Client, RecognizeUtteranceCommand } from '@aws-sdk/client-lex-runtime-v2'
import fetch from 'node-fetch'

function decompressBase64String(compressedBase64String) {
  const decodedData = Buffer.from(compressedBase64String, 'base64')
  const decompressedData = gunzipSync(decodedData)
  const originalString = decompressedData.toString('utf-8')

  return JSON.parse(originalString)
}

function webhookVerification (event) {
  const queryParams = event.queryStringParameters;
  const verify_token = process.env.VERIFY_TOKEN;

  let mode = queryParams["hub.mode"]
  let token = queryParams["hub.verify_token"]
  let challenge = queryParams["hub.challenge"]

  if (mode && token) {
    if (mode === "subscribe" && token === verify_token) {
      return {
        statusCode: 200,
        body: challenge,
      };
    } else {
      return {
        statusCode: 403,
      };
    }
  }
}

async function webhookEvent (event) {
  const body = JSON.parse(event.body)
  if (body.object) {
    const entry = body.entry?.[0]
    const changes = entry?.changes?.[0]
    const messages = changes?.value?.messages?.[0]

    if (messages) {
      const { from, text: { body: msg_body } } = messages
      return await sendMessageToLex(msg_body, from)
    }
  }

  return {
    statusCode: 200,
    body: event.body,
  }
}

async function sendMessageToLex (message, sessionId) {
  if (sessionId === '15550059538') {
    return {
      statusCode: 200
    }
  }

  var client = new LexRuntimeV2Client()

  const params = {
    botId: process.env.LEX_BOT_ID,
    botAliasId: process.env.LEX_BOT_ALIAS_ID,
    localeId: process.env.LEX_LOCALE_ID,
    sessionId,
    requestContentType: 'text/plain; charset=utf-8',
    responseContentType: 'text/plain; charset=utf-8',
    inputStream: message
  }

  const command = new RecognizeUtteranceCommand(params)
  const response = await client.send(command)

  const messages = decompressBase64String(response['messages'])
  for (let i = 0; i < messages.length; i++) {
    await sendMessageToWhatsapp(messages[i].content, sessionId)
  }

  return {
    statusCode: 200,
    body: response,
  }
}

async function sendMessageToWhatsapp (message, to) {
  const response = await fetch(
    `https://graph.facebook.com/v17.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: {
          body: message
        }
      })
    })
}

export async function lambdaHandler (event) {
  if (event.queryStringParameters) return webhookVerification(event)
  else return webhookEvent(event)
}