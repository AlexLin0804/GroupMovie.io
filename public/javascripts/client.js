var roomcode = "";
var username = "";

document.getElementById("btn_create").onclick = async function(e) {
    e.preventDefault();
    //console.log("hi");
    username = document.getElementById("username_create").value;
    //console.log("Client: ", username);
    const data = {
        username
    }
    const options = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
    }
    const response = await fetch('/submit-create', options);
    //console.log("got response:: create");
    const json = await response.json();
    //console.log("STATUS: ", json.status);
    //console.log(json);
    var error = document.getElementById("error_text_create");
    var code = json.status;
    roomcode = json.roomcode;
    //console.log('Client roomcode', roomcode);
    switch(code) {
        case 0:
            error.innerHTML = "database connection failed...";
            break;
        case 1:
            //error.innerHTML = "success... loading room";
            const data2 = {
                roomcode
            }
            const options2 = {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                },
                params: JSON.stringify(data2)
            }
            document.getElementById("username_create").value = "";
            const route = '/group/'+roomcode;
            await fetch(route, options2);
            window.location.href = route;
            break;
        case 2:
            error.innerHTML = "enter a username (4-12 characters)...";
            break;
        case 3:
            error.innerHTML = "the username is too long...";
            break;
        default:
            alert("An Unknown Error Occurred\n - Please reload the page");
            break;
    }
}

document.getElementById("btn_join").onclick = async function(e) {
    e.preventDefault();
    username = document.getElementById("username_join").value;
    roomcode = document.getElementById("roomcode").value;
    roomcode = roomcode.toUpperCase();
    const data = {
        username,
        roomcode
    }
    const options = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
    }
    const response = await fetch('/submit-join', options);
    //console.log("got response:: join");
    const json = await response.json();
    var error = document.getElementById("error_text_join");
    var code = json.status;
    switch(code) {
        case 0:
            error.innerHTML = "database connection failed...";
            break;
        case 1:
            //error.innerHTML = "success... loading room";
            const data2 = {
                roomcode
            }
            const options2 = {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                },
                params: JSON.stringify(data2)
            }
            document.getElementById("username_join").value = "";
            document.getElementById("roomcode").value = "";
            const route = '/group/'+roomcode;
            await fetch(route, options2);
            window.location.href = route;
            break;
        case 2:
            error.innerHTML = "username is too short or not present";
            break;
        case 3:
            error.innerHTML = "username is too long";
            break;
        case 4:
            error.innerHTML = "you're already in a room!";
            break;
        case 5:
            error.innerHTML = "username is taken in that room";
            break;
        case 6:
            error.innerHTML = "this room code does not exist... try creating a room";
            break;
        case 7:
            error.innerHTML = "the room code is too short or not present";
            break;
        case 8:
            error.innerHTML = "the room code is too long";
            break;
        default:
            error.innerHTML = "database connection failed...";
            break;
    }
}
