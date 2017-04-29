var host = "https://salespause-phone.au-syd.mybluemix.net"


function arrival() {
	var http = new XMLHttpRequest();
	http.open("get", host + "/notify/all", true);
	http.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
	http.setRequestHeader("auth-secret", "dekitango");
	http.send();
};

function change(type) {
	var http = new XMLHttpRequest();
	typeData = ["friend", "neighbor", "danger", "random"]
	if (type < 4) {
		console.log(typeData[type])
		typePost = "type=" + typeData[type]
	} else {
		typePost = "type=none"
	}
	http.open("post", host + "/status/types", true);
	http.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
	http.setRequestHeader("auth-secret", "dekitango");
	http.send(typePost);
};
