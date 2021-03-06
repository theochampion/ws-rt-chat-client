const io = require("socket.io-client");
const fetch = require("node-fetch");
const minimist = require("minimist");
const readline = require("readline");

const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout,
	prompt: "SWSC> "
});

/** API root url used globally */
global.API_ROOT_URL = "";

/** Constants */
const MESSAGE_TYPES = {
	TEXT: 0,
	PICTURE: 1,
	MISC: 2
};

ask = questionText => {
	return new Promise((resolve, reject) => {
		rl.question(questionText, input => resolve(input));
	});
};

const authenticate = async (email, password) => {
	try {
		const res = await fetch(`${API_ROOT_URL}/login`, {
			method: "post",
			body: JSON.stringify({ mail: email, password: password }),
			headers: { "Content-Type": "application/json" }
		});
		if (!res.ok) return null;
		const cookies = res.headers.get("set-cookie");
		const user = await res.json();
		user.session = cookies;
		return user;
	} catch (err) {
		return console.error(`\x1b[33mConnection failed: ${err.message}\x1b[0m`);
	}
};

const createConversation = async session_cookie => {
	try {
		const answer = await ask("Enter comma separated list of peer ids: ");
		const peers = answer.replace(/\s/g, "").split(",");
		const res = await fetch(`${API_ROOT_URL}/conversation`, {
			method: "post",
			headers: { Cookie: session_cookie, "Content-Type": "application/json" },
			body: JSON.stringify({ peers: peers })
		});
		if (!res.ok) return null;
		const body = await res.json();
		console.log("Created conversation:");
		console.log(body);
	} catch (error) {
		return console.log(
			`\x1b[32mError creating conversation: "${error.message}"\x1b[0m`
		);
	}
};

const selectConversation = async session_cookie => {
	try {
		const res = await fetch(`${API_ROOT_URL}/conversation`, {
			method: "get",
			headers: { Cookie: session_cookie }
		});
		if (!res.ok) throw "Authentication error";
		const body = await res.json();
		if (body.conversations.length == 0)
			console.log(
				"No conversation found. Create a new one with the 'new' command"
			);
		else {
			console.log(`\x1b[35mAvailable conversations: \x1b[0m`);
			body.conversations.map((conversation, idx) =>
				console.log(
					`[${idx}] "${conversation._id}" (${conversation.peers.length} peers)`
				)
			);
		}

		const answer = await ask("\x1b[35mSWSC $> \x1b[0m");
		if (answer == "exit") return null;
		else if (answer == "new") {
			await createConversation(session_cookie);
			return selectConversation(session_cookie);
		}
		const idx = parseInt(answer);
		if (
			!isNaN(idx) &&
			idx <= body.conversations.length &&
			body.conversations.length > 0
		)
			return body.conversations[idx]._id;

		console.error(`\x1b[31mInvalid command.\x1b[0m`);
		return selectConversation(session_cookie);
	} catch (err) {
		console.error(err);
		return null;
	}
};

const connectToConversation = async (user, conversation_id) => {
	return new Promise((resolve, reject) => {
		const socket = io.connect(API_ROOT_URL, {
			query: `conversation_id=${conversation_id}`,
			transportOptions: {
				polling: {
					extraHeaders: {
						Cookie: user.session
					}
				}
			}
		});

		socket.on("connect", () => {
			console.log(
				`\x1b[32mConnected to conversation [${conversation_id}]\x1b[0m`
			);
			rl.on("line", line => {
				socket.emit("message", {
					sender: user._id,
					content: line,
					type: MESSAGE_TYPES.TEXT
				});
			});
		});

		socket.on("new_message", msg => {
			if (msg.type == MESSAGE_TYPES.MISC)
				console.log(`\x1b[33m${msg.content}\x1b[0m`);
			else
				console.log(
					`\x1b[${msg.sender == user._id ? "32" : "35"}m<${msg.sender}> ${
						msg.content
					}\x1b[0m`
				);
		});

		socket.on("disconnect", () => {
			console.log("Disconnected");
			resolve();
		});

		socket.on("error", error => {
			console.error(
				`\x1b[31mImpossible to connect to chat service : "${error}"\x1b[0m`
			);
			reject();
		});
	});
};

const main = async () => {
	let email, password;
	try {
		const argv = minimist(process.argv.slice(2), {
			default: { host: "http://localhost", port: "3030" }
		});
		email = argv.email;
		password = argv.pass;
		API_ROOT_URL = `${argv.host}:${argv.port}`;
	} catch (err) {
		return console.error(
			`\x1b[35mUsage: node index.js [--host <host> ] [--port <port>] --email <email> --pass <password>\x1b[0m`
		);
	}
	const user = await authenticate(email, password);
	if (user == null) process.exit(1);

	console.log(
		`\x1b[32mLogged in as \x1b[4m${user.name} ${
			user.lastname
		}\x1b[0m\x1b[33m (${user._id})\x1b[0m`
	);
	console.log(
		`###############################################
#              Welcome to SWSC                #
#                                             #
# Select a conversation to connect to it or   #
# enter one of the available commands :       #
#                                             #
#  <idx> - connect to selected conversation   #                                        #
#  new   - create new conversation            #
#  exit  - exit the program                   #
#                                             #
###############################################`
	);
	while (true == true) {
		const conversation_id = await selectConversation(user.session);
		if (conversation_id == null) process.exit(1);
		await connectToConversation(user, conversation_id);
	}
};

main();
