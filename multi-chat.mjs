// Multi-chat Twitch + YouTube + TikTok
// Autor: Matheus Albuquerque (Bucherche.Coder)
// Rodar com: node multi-chat.mjs
// Abra no navegador do PC ou celular: http://IP_DO_PC:PORTA

import { exec } from 'child_process';
import express from 'express';
import http from 'http';
import net from 'net';
import os from 'os';
import { Server } from 'socket.io';
import { TikTokLiveConnection, WebcastEvent } from 'tiktok-live-connector';
import tmi from 'tmi.js';

// ================= CONFIGURAÇÕES =================
const TWITCH_CHANNEL = 'mauriicin'; // coloque o nome do seu canal Twitch.
const TIKTOK_USERNAME = 'mauriciin'; // coloque seu usuário TikTok.
const YT_CHANNEL_ID = 'ID_DO_SEU_CANAL_YOUTUBE'; // coloque o ID do canal YouTube (não o nome, veja na URL do canal).
const YT_API_KEY = 'SUA_CHAVE_AQUI'; // sua chave de API do YouTube. Obtenha em: https://console.developers.google.com/apis/credentials

// ================= LIMITE DE COTAS =================
const YOUTUBE_DAILY_QUOTA = 10000;
let youtubeCallCount = 0;
const YOUTUBE_INTERVAL_MS = Math.floor(
	(24 * 60 * 60 * 1000) / YOUTUBE_DAILY_QUOTA,
);

// ================= FUNÇÃO DE LOG LIMPO =================
function logError(platform, message) {
	console.log(`❌ [${platform}] ${message}`);
}

// ================= FUNÇÃO PORTA LIVRE =================
async function findFreePort(startPort) {
	let port = startPort;
	while (true) {
		const isFree = await new Promise((resolve) => {
			const tester = net
				.createServer()
				.once('error', () => resolve(false))
				.once('listening', () =>
					tester.once('close', () => resolve(true)).close(),
				)
				.listen(port);
		});
		if (isFree) return port;
		port++;
	}
}

// ================= FUNÇÃO IP LOCAL =================
function getLocalIP() {
	const interfaces = os.networkInterfaces();
	for (const iface of Object.values(interfaces)) {
		for (const i of iface) {
			if (i.family === 'IPv4' && !i.internal) {
				return i.address;
			}
		}
	}
	return 'localhost';
}

// ================= SERVIDOR =================
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.get('/', (req, res) => {
	res.send(`
    <html>
      <head>
        <title>Multi Chat</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          * { box-sizing: border-box; }
          body {
            font-family: 'Segoe UI', Arial, sans-serif;
            background: transparent;
            color: #eee;
            margin: 0; padding: 0;
          }
          body.with-bg { background: #0e0c1e; }
          #chat { padding: 10px; display: flex; flex-direction: column; gap: 5px; }
          .msg {
            padding: 8px 12px; border-radius: 8px;
            display: flex; align-items: flex-start; gap: 9px;
            border-left: 3px solid transparent;
            animation: fadeIn 0.18s ease;
            font-size: 0.88rem; line-height: 1.45;
          }
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(5px); }
            to   { opacity: 1; transform: translateY(0); }
          }
          .msg .icon { flex-shrink: 0; width: 17px; height: 17px; margin-top: 2px; }
          .msg .icon svg { width: 17px; height: 17px; display: block; }
          .msg .content { flex: 1; word-break: break-word; }
          .msg .username { font-weight: 700; margin-right: 4px; }
          .twitch  { background: rgba(0,0,0,0.75); border-left-color: #9146FF; }
          .twitch  .icon, .twitch  .username { color: #9146FF; }
          .twitch  .content { color: #ffffff; }
          .youtube { background: rgba(0,0,0,0.75); border-left-color: #FF4444; }
          .youtube .icon, .youtube .username { color: #FF4444; }
          .youtube .content { color: #ffffff; }
          .tiktok  { background: rgba(0,0,0,0.75); border-left-color: #69C9D0; }
          .tiktok  .icon, .tiktok  .username { color: #69C9D0; }
          .tiktok  .content { color: #ffffff; }
        </style>
      </head>
      <body>
        <div id="chat"></div>
        <script src="/socket.io/socket.io.js"></script>
        <script>
          if (new URLSearchParams(location.search).get('bg') === 'active') {
            document.body.classList.add('with-bg');
          }

          const ICONS = {
            twitch:  '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z"/></svg>',
            youtube: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M23.495 6.205a3.007 3.007 0 0 0-2.088-2.088c-1.87-.501-9.396-.501-9.396-.501s-7.507-.01-9.396.501A3.007 3.007 0 0 0 .527 6.205a31.247 31.247 0 0 0-.522 5.805 31.247 31.247 0 0 0 .522 5.783 3.007 3.007 0 0 0 2.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.396-.502a3.007 3.007 0 0 0 2.088-2.088 31.247 31.247 0 0 0 .5-5.783 31.247 31.247 0 0 0-.5-5.805zM9.609 15.601V8.408l6.264 3.602z"/></svg>',
            tiktok:  '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg>'
          };

          function esc(s) {
            return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
          }

          const socket = io();
          const chat = document.getElementById('chat');
          socket.on('chat', data => {
            const div = document.createElement('div');
            div.className = 'msg ' + data.platform;
            div.innerHTML =
              '<span class="icon">' + ICONS[data.platform] + '</span>' +
              '<span class="content"><span class="username">' + esc(data.user) + '</span> ' + esc(data.msg) + '</span>';
            chat.appendChild(div);
            window.scrollTo(0, document.body.scrollHeight);
          });
        </script>
      </body>
    </html>
  `);
});

// ================= TWITCH =================
const twitchClient = new tmi.Client({ channels: [TWITCH_CHANNEL] });
twitchClient.connect();
twitchClient.on('connected', () =>
	console.log('✅ Conectado ao chat da Twitch'),
);
twitchClient.on('message', (channel, tags, message, self) => {
	if (self) return;
	io.emit('chat', {
		platform: 'twitch',
		user: tags['display-name'],
		msg: message,
	});
});
twitchClient.on('error', (err) => logError('Twitch', err.message));

// ================= YOUTUBE =================
// const youtube = google.youtube({ version: 'v3', auth: YT_API_KEY });
// let cachedLiveChatId = null;
// let lastFetchedTime = 0;

// async function getLiveChatId() {
// 	try {
// 		const now = Date.now();
// 		if (cachedLiveChatId && now - lastFetchedTime < 60000)
// 			return cachedLiveChatId;

// 		const res = await youtube.search.list({
// 			part: 'id',
// 			channelId: YT_CHANNEL_ID,
// 			eventType: 'live',
// 			type: 'video',
// 		});
// 		if (res.data.items.length === 0) return null;
// 		const liveId = res.data.items[0].id.videoId;
// 		const live = await youtube.videos.list({
// 			part: 'liveStreamingDetails',
// 			id: liveId,
// 		});
// 		cachedLiveChatId =
// 			live.data.items[0].liveStreamingDetails.activeLiveChatId;
// 		lastFetchedTime = now;
// 		return cachedLiveChatId;
// 	} catch {
// 		logError(
// 			'YouTube',
// 			'Nenhum chat ativo do YouTube encontrado. Tentando novamente...',
// 		);
// 		return null;
// 	}
// }

// async function pollYouTubeChat() {
// 	let nextPageToken = '';
// 	setInterval(async () => {
// 		if (youtubeCallCount >= YOUTUBE_DAILY_QUOTA) return;

// 		try {
// 			const chatId = await getLiveChatId();
// 			if (!chatId) {
// 				logError(
// 					'YouTube',
// 					'Nenhum chat ativo do YouTube encontrado. Tentando novamente...',
// 				);
// 				return;
// 			}
// 			const res = await youtube.liveChatMessages.list({
// 				liveChatId: chatId,
// 				part: 'snippet,authorDetails',
// 				pageToken: nextPageToken,
// 			});
// 			youtubeCallCount++;

// 			// ✅ Status de conexão do YouTube
// 			console.log('✅ Conectado ao chat do YouTube');

// 			res.data.items.forEach((item) => {
// 				io.emit('chat', {
// 					platform: 'youtube',
// 					user: item.authorDetails.displayName,
// 					msg: item.snippet.displayMessage,
// 				});
// 			});
// 			nextPageToken = res.data.nextPageToken || '';
// 		} catch {
// 			logError('YouTube', 'Erro ao pegar mensagens do chat');
// 		}
// 	}, YOUTUBE_INTERVAL_MS);
// }

// pollYouTubeChat();

// ================= TIKTOK =================

let tiktokConnection = new TikTokLiveConnection(TIKTOK_USERNAME);
let tiktokReconnectTimer = null;

function scheduleTikTokReconnect() {
	if (tiktokReconnectTimer) return;
	console.log('🔄 [TikTok] Tentando reconectar em 1 minuto...');
	tiktokReconnectTimer = setTimeout(() => {
		tiktokReconnectTimer = null;
		tiktokConnection = new TikTokLiveConnection(TIKTOK_USERNAME);
		startTikTok();
	}, 60_000);
}

async function startTikTok() {
	try {
		await tiktokConnection.connect();
		if (tiktokReconnectTimer) {
			clearTimeout(tiktokReconnectTimer);
			tiktokReconnectTimer = null;
		}
		console.log('✅ Conectado ao chat do TikTok');

		tiktokConnection.on(WebcastEvent.CHAT, (data) => {
			io.emit('chat', {
				platform: 'tiktok',
				user: data.user.nickname,
				msg: data.comment,
			});
		});

		tiktokConnection.on('connected', () =>
			console.log('✅ TikTok conectado'),
		);
		tiktokConnection.on('disconnected', () => {
			logError('TikTok', 'Desconectado do chat');
			scheduleTikTokReconnect();
		});
		tiktokConnection.on('error', () =>
			logError('TikTok', 'Erro ao conectar no chat'),
		);
	} catch (erro) {
		logError('TikTok', 'Erro ao conectar no TikTok');
		scheduleTikTokReconnect();
	}
}

startTikTok();

// ================= START SERVIDOR COM PORTA DINÂMICA =================
(async () => {
	const PORT = await findFreePort(3000);
	const LOCAL_IP = getLocalIP();
	server.listen(PORT, '0.0.0.0', () => {
		const url = `http://${LOCAL_IP}:${PORT}`;
		console.log(`✅ Multi-chat rodando em ${url}`);

		exec(`echo ${url} | clip`, (err) => {
			if (err) {
				logError(
					'Servidor',
					'Não foi possível copiar o link para a área de transferência',
				);
			} else {
				console.log(
					'📋 Link copiado para a área de transferência! Agora é só colar no navegador do celular.',
				);
			}
		});
	});
})();
