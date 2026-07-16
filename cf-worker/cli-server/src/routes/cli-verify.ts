import { Hono } from "hono";
import { html } from "hono/html";

type Env = {
	Bindings: {
		GITHUB_CLIENT_ID: string;
	};
};

export const cliVerifyRouter = new Hono<Env>();

cliVerifyRouter.get("/", (c) => {
	const githubClientId = c.env.GITHUB_CLIENT_ID;

	return c.html(html`
		<!DOCTYPE html>
		<html lang="en">
			<head>
				<meta charset="UTF-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1.0" />
				<title>web3deploy — Authenticate</title>
				<link rel="preconnect" href="https://fonts.googleapis.com" />
				<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
				<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
				<style>
					:root {
						--bg:        #0f0f0f;
						--card:      #161616;
						--border:    #212121;
						--border-2:  #2a2a2a;
						--text:      #e8e8e8;
						--muted:     #888;
						--accent:    #d97757;
						--accent-bg: rgba(217,119,87,0.08);
						--green:     #10b981;
						--green-bg:  rgba(16,185,129,0.1);
						--red:       #ef4444;
						--red-bg:    rgba(239,68,68,0.1);
						--sans: 'Inter', system-ui, -apple-system, sans-serif;
						--mono: 'JetBrains Mono', 'Consolas', monospace;
					}

					*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

					body {
						background: var(--bg);
						color: var(--text);
						font-family: var(--sans);
						font-size: 14px;
						min-height: 100vh;
						display: flex;
						align-items: center;
						justify-content: center;
						padding: 1.5rem;
						-webkit-font-smoothing: antialiased;
						-moz-osx-font-smoothing: grayscale;
					}

					/* Card */
					.card {
						background: var(--card);
						border: 1px solid var(--border);
						border-radius: 14px;
						padding: 2.25rem;
						width: 100%;
						max-width: 480px;
						box-shadow:
							0 0 0 1px rgba(255,255,255,0.04),
							0 20px 60px rgba(0,0,0,0.7),
							0 4px 16px rgba(0,0,0,0.4);
					}

					/* Brand */
					.brand {
						display: flex;
						align-items: center;
						gap: 0.5rem;
						padding-bottom: 1.5rem;
						margin-bottom: 1.5rem;
						border-bottom: 1px solid var(--border);
					}
					.brand-icon {
						color: var(--accent);
						font-size: 1rem;
						line-height: 1;
						flex-shrink: 0;
					}
					.brand-name {
						font-size: 0.875rem;
						font-weight: 600;
						letter-spacing: -0.02em;
					}
					.brand-badge {
						margin-left: auto;
						font-size: 0.7rem;
						font-weight: 500;
						color: var(--muted);
						background: rgba(255,255,255,0.05);
						border: 1px solid var(--border);
						padding: 0.15rem 0.55rem;
						border-radius: 100px;
						letter-spacing: 0.02em;
					}

					/* State wrapper */
					.state { display: flex; flex-direction: column; justify-content: center; }

					/* Animations */
					@keyframes fade-up {
						from { opacity: 0; transform: translateY(6px); }
						to   { opacity: 1; transform: translateY(0); }
					}
					@keyframes pop {
						0%   { transform: scale(0.85); opacity: 0; }
						60%  { transform: scale(1.05); }
						100% { transform: scale(1); opacity: 1; }
					}
					.fade-up  { animation: fade-up 0.28s ease-out forwards; }
					.pop-in   { animation: pop 0.35s ease-out forwards; }

					/* Icon circles */
					.icon-circle {
						width: 48px; height: 48px;
						border-radius: 50%;
						display: flex; align-items: center; justify-content: center;
						font-size: 1.3rem;
						margin: 0 auto 1.1rem auto;
					}
					.icon-circle.green { background: var(--green-bg); color: var(--green); }
					.icon-circle.red   { background: var(--red-bg);   color: var(--red); }

					/* Headings */
					.state-title {
						font-size: 1.05rem;
						font-weight: 600;
						letter-spacing: -0.02em;
						margin-bottom: 0.4rem;
					}
					.state-body {
						font-size: 0.9rem;
						color: var(--muted);
						line-height: 1.55;
					}

					/* Email pill */
					.pill {
						display: inline-flex;
						align-items: center;
						width: fit-content;
						margin: 1rem auto 0 auto;
						gap: 0.4rem;
						padding: 0.3rem 0.75rem;
						background: rgba(255,255,255,0.04);
						border: 1px solid var(--border);
						border-radius: 10px;
						font-size: 0.85rem;
						font-family: var(--mono);
						color: var(--muted);
					}

					/* Close hint */
					.close-hint {
						margin-top: 1.5rem;
						font-size: 0.85rem;
						color: var(--muted);
						opacity: 0.7;
					}

					/* Error command */
					.cmd {
						font-family: var(--mono);
						font-size: 0.75rem;
						color: var(--accent);
						background: var(--accent-bg);
						padding: 0.15rem 0.45rem;
						border-radius: 4px;
					}

					/* Manual form */
					.field-label {
						display: block;
						font-size: 0.75rem;
						color: var(--muted);
						margin-bottom: 0.5rem;
					}
					.input-row {
						display: flex;
						align-items: stretch;
						background: #0c0c0c;
						border: 1px solid var(--border);
						border-radius: 8px;
						overflow: hidden;
						margin-bottom: 0.75rem;
						transition: border-color 0.15s, box-shadow 0.15s;
					}
					.input-row:focus-within {
						border-color: var(--accent);
						box-shadow: 0 0 0 3px rgba(217,119,87,0.1);
					}
					.input-prefix {
						padding: 0.6rem 0.8rem;
						font-size: 0.78rem;
						font-family: var(--mono);
						color: var(--muted);
						border-right: 1px solid var(--border);
						background: rgba(255,255,255,0.02);
						display: flex;
						align-items: center;
						flex-shrink: 0;
					}
					input[type="text"] {
						background: transparent;
						border: none;
						outline: none;
						color: var(--text);
						font-family: var(--mono);
						font-size: 0.95rem;
						padding: 0.6rem 0.85rem;
						width: 100%;
						letter-spacing: 3px;
					}
					input::placeholder { color: #2e2e2e; letter-spacing: 1px; }

					.btn {
						width: 100%;
						padding: 0.65rem;
						background: var(--accent);
						color: #fff;
						border: none;
						border-radius: 8px;
						font-family: var(--sans);
						font-size: 0.85rem;
						font-weight: 500;
						letter-spacing: -0.01em;
						cursor: pointer;
						transition: background 0.15s, transform 0.1s;
						display: flex;
						align-items: center;
						justify-content: center;
						gap: 0.5rem;
						text-decoration: none;
					}
					.btn:hover:not(:disabled) { background: #c86646; }
					.btn:active:not(:disabled) { transform: scale(0.99); }
					.btn:disabled { opacity: 0.35; cursor: not-allowed; }

					.github-icon {
						width: 18px;
						height: 18px;
						fill: currentColor;
					}

					.hidden { display: none !important; }
				</style>
			</head>
			<body>
				<div class="card">
					<!-- Brand header -->
					<div class="brand">
						<span class="brand-icon">❖</span>
						<span class="brand-name">web3deploy</span>
						<span class="brand-badge">CLI auth</span>
					</div>

					<!-- GitHub Auth -->
					<div id="state-github" class="state hidden">
						<div class="state-title" style="margin-bottom:1rem;">Authenticate CLI</div>
						<div class="state-body" style="margin-bottom:1.5rem;">
							Click the button below to authenticate with GitHub.
						</div>
						<a class="btn" id="github-login-btn" href="#">
							<svg class="github-icon" viewBox="0 0 98 96" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M48.854 0C21.839 0 0 22 0 49.217c0 21.756 13.993 40.172 33.405 46.69 2.427.49 3.316-1.059 3.316-2.362 0-1.141-.08-5.052-.08-9.127-13.59 2.934-16.42-5.867-16.42-5.867-2.184-5.704-5.42-7.17-5.42-7.17-4.448-3.015.324-3.015.324-3.015 4.934.326 7.523 5.052 7.523 5.052 4.367 7.496 11.404 5.378 14.235 4.074.404-3.178 1.699-5.378 3.074-6.6-10.839-1.141-22.243-5.378-22.243-24.283 0-5.378 1.94-9.778 5.014-13.2-.485-1.222-2.184-6.275.486-13.038 0 0 4.125-1.304 13.426 5.052a46.97 46.97 0 0 1 12.214-1.63c4.125 0 8.33.571 12.213 1.63 9.302-6.356 13.427-5.052 13.427-5.052 2.67 6.763.97 11.816.485 13.038 3.155 3.422 5.015 7.822 5.015 13.2 0 18.905-11.404 23.06-22.324 24.283 1.78 1.548 3.316 4.481 3.316 9.126 0 6.6-.08 11.897-.08 13.526 0 1.304.89 2.853 3.316 2.364 19.412-6.52 33.405-24.935 33.405-46.691C97.707 22 75.788 0 48.854 0z"/></svg>
							Continue with GitHub
						</a>
					</div>

					<!-- Manual code entry (fallback: no ?code= in URL) -->
					<div id="state-manual" class="state hidden">
						<div class="state-title" style="margin-bottom:1rem;">Enter your device code</div>
						<div class="input-row">
							<span class="input-prefix">code</span>
							<input type="text" id="user-code" placeholder="XXXX-XXXX" maxlength="9" autocomplete="off" spellcheck="false" />
						</div>
						<button class="btn" id="verify-button">Continue with GitHub</button>
						<div id="manual-status"></div>
					</div>

					<!-- Success -->
					<div id="state-success" class="state hidden" style="text-align:center;">
						<div class="icon-circle green pop-in" id="success-icon">✓</div>
						<div class="state-title fade-up">Authenticated</div>
						<div class="state-body fade-up">Your CLI session is now active.</div>
						<div class="pill fade-up">
							<span id="success-email"></span>
						</div>
						<div class="close-hint fade-up">You can close this window and return to your terminal.</div>
					</div>

					<!-- Error -->
					<div id="state-error" class="state hidden" style="text-align:center;">
						<div class="icon-circle red pop-in">✗</div>
						<div class="state-title fade-up">Authentication failed</div>
						<div class="state-body fade-up" id="error-message"></div>
						<div class="close-hint fade-up" style="margin-top:0.85rem;">
							Run <span class="cmd">web3deploy login</span> to try again.
						</div>
					</div>
				</div>

				<script>
					const params = new URLSearchParams(window.location.search);
					const prefilledCode = params.get('code');
					const successParam = params.get('success');
					const errorParam = params.get('error');
					const emailParam = params.get('email');
					const avatarParam = params.get('avatar');
					
					const clientId = "${githubClientId}";

					const STATES = ['state-github', 'state-manual', 'state-success', 'state-error'];
					function show(id) {
						STATES.forEach(s => document.getElementById(s).classList.add('hidden'));
						document.getElementById(id).classList.remove('hidden');
					}

					window.addEventListener('load', () => {
						if (successParam) {
							if (emailParam) {
								document.getElementById('success-email').textContent = emailParam;
							}
							if (avatarParam) {
								const icon = document.getElementById('success-icon');
								icon.innerHTML = '<img src="' + avatarParam + '" alt="Profile" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover; border: 2px solid var(--green);" />';
								icon.style.background = 'transparent';
							}
							show('state-success');
						} else if (errorParam) {
							document.getElementById('error-message').textContent = errorParam;
							show('state-error');
						} else if (prefilledCode) {
							const authUrl = \`https://github.com/login/oauth/authorize?client_id=\${clientId}&state=\${prefilledCode}\`;
							document.getElementById('github-login-btn').href = authUrl;
							show('state-github');
						} else {
							show('state-manual');
						}
					});

					// Manual form
					document.getElementById('user-code').addEventListener('input', (e) => {
						let v = e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
						if (v.length > 4) v = v.slice(0, 4) + '-' + v.slice(4);
						e.target.value = v;
					});

					document.getElementById('verify-button').addEventListener('click', () => {
						const code = document.getElementById('user-code').value.trim();
						if (!code) return;
						const authUrl = \`https://github.com/login/oauth/authorize?client_id=\${clientId}&state=\${code}\`;
						window.location.href = authUrl;
					});
				</script>
			</body>
		</html>
	`);
});