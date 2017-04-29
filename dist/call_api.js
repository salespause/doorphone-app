var host = "https://salespause-phone.au-syd.mybluemix.net"

arrival();

function arrival() {
	var http = new XMLHttpRequest();
	http.open("get", host + "/notify/all", true);
	http.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
	http.setRequestHeader("auth-secret", "dekitango");
	http.send();
};

function change(type) {
	xmlhttp.open("POST", url);
	xmlhttp.setRequestHeader("x-filename", photoId);
	xmlhttp.send(formData);
}
