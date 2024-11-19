// File: sst-doc.js
// Created by: @ajrdanj
// Purpose: Javascript code for front end of webpage with back-end API calls

// ensure page has loaded completely before manipulating data to prevent null values
document.addEventListener('DOMContentLoaded', init, false);


// Department name
var department;
// range of lines for selected department
var sub1lines = [];
// dynamoDB value for user-generated name for department lines.
var lineName = "";
// variable to hold value of station manipulated by user
var selectedStationID;
// variable to hold base URL of webpage
var baseURL = "[REDACTED FOR PRIVACY]"

// create flag variable to track status of back-end processing
var dataProccessing = false;


// common amazon device resolutions  (For adding page responsiveness)
// 1920 x 1080
// 2560 x 1440
// 3840 x 2160

// variables to hold query string values for WHID and Department
var qwhid;
var qdept;

// check to see if query params are included in URL, and update webpage accordingly.
const url = new URL(window.location.href)        // get window's current URL
const params = new URLSearchParams(url.search);  // search for query strings present in URL
if (params.has('whid')) {
    // get WHID params of query string
    qwhid = params.get('whid');
}
if (params.has('Department')) {
    // get Department params of query string
    qdept = params.get('Department');
}

// async function for making backend API calls
async function fetchData(url, body={}, whids=false) {
    // variable to determine whether backend computations are being made
    // this is present to prevent page from refreshing during an API call
    dataProccessing = true;
    // variable for holding resultant return data of API call
    var data;
    // Since API call for WHID's is a GET function, ensure there is no body to prevent exception
    try {
        if(whids) {
            const response = await fetch(url);
            data = await response.json();
            dataProccessing = false;
            return data;
        }
        // if call is not for getting WHID's, run normally with supplied body.
        else {
            const response = await fetch(url, {method: "POST", body: JSON.stringify(body)});
            data = await response.json();
            dataProccessing = false;
            return data;
        }
    }
    // exception for API call failure.
    catch(e) {
        console.log("Error fetching data " + e);
        dataProccessing = false;
        return null;
    }
}

// Function for ensuring that page refresh is not taking place during any back-end operations.
function checkForRefresh() {
    if (!dataProccessing) {
        location.reload();
    }
}

// Function for getting all HTML elements by class name
async function getByClass(classname) {
    return document.querySelectorAll(classname);
}

// Function for clearing all elements of HTML body when swapping between departments and WHIDs
async function clearBody() {
    // get and remove department header element
    var c = await getByClass(".departmentheader");
    c = Array.from(c);
    // get and remove all 'line' elements (line being each line in user-selected department)
    var cc = await getByClass(".line");
    cc = Array.from(cc);
    // remove department header
    for (let x = 0; x < c.length; x++) {
        try{
            c[x].remove();
        }
        catch(e){}
    }
    // remove lines and children [stations]
    for (let x = 0; x < cc.length; x++) {
        cc[x].replaceChildren();
        cc[x].remove();
    }
    // set all station and line data to nothing (user will be making different selection)
    sub1lines = [];
    return true;
}

// init function to be run after DOM elements of page load
async function init() {
    // check for backend computing and refresh if none is present.
    // Refresh the page every 5 minutes (300,000 milliseconds)
    setInterval(checkForRefresh, 300000);

    // get select box for departments and set event listener for user selecting a department
    const select = document.querySelector("#departmentSelect");
    select.addEventListener("change", async (event) => {
        // update url with query strings
        const whid = document.querySelector("#whidSelect").value;
        window.location.href = baseURL + "?whid=" + whid + "&Department=" + select.options[select.selectedIndex].innerHTML;

        // clear html body for repopulation of lines/stations
        await clearBody();
        // while backend is computing, disable select status for department select box
        await setSelectStatus(false);
        // set department variable equal to user's selected department.
        department = select.options[select.selectedIndex].innerHTML
        // populate lines based on user's selected department.
        await populateLines({"Department_ID": select.value})
    });

    // grab available WHID's from database
    await populateWHIDs();

    // check to see if query params are present, and populate data accordingly
    // if value for for qwhid has been set (if query strings are present for webpage) populate page with relevant data
    if (qwhid) {
        const select = document.querySelector("#whidSelect");
        select.value = qwhid;
        // API call for grabbing all departments based on user-selected WHID
        await populateDepts({'WHID': qwhid});
        if (qdept) {
            const select = document.querySelector("#departmentSelect")
            select.value = qwhid + "-" + qdept;
            department = qdept;
            // API call for grabbing line and station information based on user-selected Department
            await populateLines({"Department_ID": qwhid + "-" + qdept});
        }
    }
}

// function for getting station status from dynamodb
async function getStationStatus(stationID) {
    var body = {"Station_ID": stationID};
    // API call for getting station status from dynamodb
    const response = await fetchData("[REDACTED FOR PRIVACY]", body);
    var dir = response["body"];
    return dir[0]["Status"];
}

// function for getting ticket id from dynamodb
async function getTicketID(stationID) {
    var body = {"Station_ID": stationID};
    // API call for getting ticket id from dynamodb
    const response = await fetchData("[REDACTED FOR PRIVACY]", body)
    var dir = response["body"];
    // return relevant data from json payload
    return dir[0]["Ticket_ID"];
}

// function for updating database with changes initiated by user
async function updateStation(str, ticketid) {
    // get station ID of user-mutated station
    var dat = selectedStationID;
    // string manipulation to pull line data from station ID in order to make correct API call
    let resp;
    for (let i = dat.length - 1; i >= 0; i--) {
        if(dat.charAt(i) == "-") {
            resp = i;
            break;
        }
    }
    // declare variable line id to hold string manipulated substring
    var lineid = String(dat).substring(0, resp)
    // declare body for JSON payload to make API call
    var body = {"LineID": lineid, "StationID": selectedStationID, "Status": str, "TicketID": ticketid};
    // make API call to update database
    const response = await fetchData("[REDACTED FOR PRIVACY]", body);
}

// function for getting the status of a ticket (to ensure station status cannot be marked as UP with a ticket still open, etc.)
async function checkTicketStatus(ticketID) {
    // make API call with supplied ticketID
    const response = await fetchData("[REDACTED FOR PRIVACY]", {"ticket_id": ticketID});
    var dir = response["body"];
    // return status from JSON payload
    return dir["message"];
}

// function for creating a ticket, used when user marks a station as DOWN or having ISSUES
async function createIssue(stationID, str) {
    // get WHID for ticket configuration
    var select = document.querySelector("#whidSelect");
    const WHID = select.options[select.selectedIndex].innerHTML;
    // get Department for ticket configuration
    select = document.querySelector("#departmentSelect");
    const Dept = select.options[select.selectedIndex].innerHTML;
    // instantiate description and title variables for ticket configuration
    var description;
    var title;
    // if station is down, update title and description of ticket accordingly
    if (str.includes("down")) {
        description = "Station is " + str + ". Please remediate this issue as soon as possible.";
        title = "[" + WHID + "] Operations has reported station down at: " + Dept + " " + stationID.textContent;
    }
    // if station has issues, update title and description of ticket accordingly
    else {
        description = "Station has " + str + ", however station is still operable. Please plan to remediate this issue as quickly as possible.";
        title = "[" + WHID + "] Operations has reported issues at: " + Dept + " " + stationID.textContent;

    }
    // make API call to create ticket
    const response = await fetchData("[REDACTED FOR PRIVACY]", {"title": title, "description": description, "requester": "null", "type": "Client Devices", "item": "Peripherals", "whid": WHID});
    var dir = response["body"];
    // call updateStation to update database with newly created ticket id ["dir[message]"]
    await updateStation(str, dir["message"]);
    return dir["message"];
}

// function for pulling all available WHID's from database to be included in user selection
async function populateWHIDs() {
    // Make API call to pull WHID's from database
   const whids = await fetchData("[REDACTED FOR PRIVACY]", "", true);
   // call function to update WHID's "select" node with supplied data from API call
   await setWHIDSelect(whids);
}

// function for pulling all available departments from database by supplied WHID
async function populateDepts(WHID) {
    // make API call to pull departments from database
   const depts = await fetchData("[REDACTED FOR PRIVACY]", WHID);
   // call function to update department "select" node with supplied data from API call
   await setDeptSelect(depts);
   // call function to re-enable department 'select' node after backend computations complete
   await setSelectStatus(true);
}

// function for pulling all line data from database by supplied department id
async function populateLines(DeptID) {
    // make API call to pull line data
    const lines = await fetchData("[REDACTED FOR PRIVACY]", DeptID);
    // clear all station graphics from window to save memory
    await clearBody();
    // call function to parse JSON payload for needed line data
    await parseLineData(lines);
    // call function to re-enable department 'select' node after backend computations complete
    await setSelectStatus(true);
}

// function for pulling all station data from database by supplied line id
async function populateStations(LineID, dir) {
    // make API call to pull station data
    const stations = await fetchData("[REDACTED FOR PRIVACY]", LineID)
    // create multidimensional array with each line, and all of their stations ex. [Line 1, [1-1, 1-2, 1-3, 1-4, 1-5]]
    dir = [dir, await parseStationData(stations)];
    // sort stations so that the are displayed in numerical order on GUI
    await sortLines(dir[1]);
    // add resulting multidimensional array to global sub1lines variable
    sub1lines.push(dir);
}

// function for parseing through JSON payload of station data to pull needed information
async function parseStationData(dict) {
    // create empty array to hold parsed station data
    var result = [];
    // declare variable to hold body of supplied JSON payload
    var dir = dict["body"];
    // iterate through dir and pull required information and push to result array
    for (let x = 0; x < dir.length; x++) {
        result.push([dir[x]["Station_Value"], dir[x]["Status"], dir[x]["Ticket_ID"]]);
    }
    // return result
    return result;
}

// function for updating department select node with data pulled from API call
async function setDeptSelect(dict) {
    // query select department select node
    const select = document.querySelector("#departmentSelect");
    // clear node of any entries
    select.replaceChildren();
    // add hidden default item to select node for presentation
    defaultDeptSelect();
    // assign variable to body of JSON payload
    var dir = dict["body"];
    // sort departments
    dir = dir.sort();
    // iterate through JSON body and configure department select node with relevant data
    for (let x = 0; x < dir.length; x++) {
        const option = document.createElement("option");
        option.value = dir[x]["Department_ID"];
        option.innerHTML = dir[x]["Name"];
        select.appendChild(option);
    }
}

// function for adding default select item to department select node (mostly for query string URL manipulation)
async function defaultDeptSelect() {
    // query select department select node
    const deptsel = document.querySelector("#departmentSelect");
    // clear node children
    deptsel.innerHTML = "";
    // create and configure default select option
    var def = document.createElement('option');
    def.value = "none";
    def.selected = true;
    def.disabled = true;
    def.hidden = true;
    def.innerHTML = "Departments";
    // append default select option to department select node
    deptsel.appendChild(def);
}

// function for configuring WHID select node from supplied API JSON payload
async function setWHIDSelect(dict) {
    // query select WHID select node
    const select = document.querySelector("#whidSelect");
    // variable for holding body of JSON payload
    var dir = dict["body"];
    // sort body
    dir.sort();
    // iterate through body and configure select options with needed data
    for (let x = 0; x < dir.length; x++) {
        const option = document.createElement("option");
        option.value = dir[x]["WHID"];
        option.innerHTML = dir[x]["WHID"];
        select.appendChild(option);
    }
    // add event listener to reset department select node when changing WHID select node
    select.addEventListener("change", async (event) => {
        // clear html body to save memory
        await clearBody();
        defaultDeptSelect();
        // do not allow select node to change when making backend computations
        setSelectStatus(false);
        // make API call to grab department data after changing WHID
        await populateDepts({'WHID': select.value});
    });
}

// function for disabling select nodes when making backend computations regarding them
async function setSelectStatus(bool) {
    var whid = document.querySelector("#whidSelect");
    var dept = document.querySelector("#departmentSelect");
    whid.disabled = !bool;
    dept.disabled = !bool;
}

// function for getting user selected WHID from select node
async function getWHID() {
    var whid = document.querySelector("#whidSelect");
    return whid.options[whid.selectedIndex].innerHTML;
}

// function for getting user selected Department from select node
async function getDept() {
    var dept = document.querySelector("#departmentSelect");
    return dept.options[dept.selectedIndex].innerHTML;
}

// function for parsing through JSON payload to pull needed line data
async function parseLineData(dict) {
    // assign variable to value of JSON body
    var dir = dict["body"];
    // iterate through JSON body and pull required data
    for (let x = 0; x < dir.length; x++) {
        await populateStations({"Line_ID": dir[x]["Line_ID"]}, dir[x]["Line_Value"]);
        lineName = dir[x]["Line_Name"];
    }
    var body = document.querySelector("#main-body");
    // call function for setting up graphical representation of line/station data after stations have been populated.
    setupMap(body);
}

// function for sorting arrays both alphabetically and numerically
async function sortLines(arr) {
    // find out how many stations/lines have characters in them
    var num = 0;
    // min value for first digit only value
    var min;
    var minIndex;
    // move char stations/lines to the front of array
    for (let x = 0; x < arr.length; x++) {
        // move char stations to the front of array
        if (!parseInt(arr[x][0])) {
            var temp = arr[x];
            arr[x] = arr[num];
            arr[num] = temp;
            num++;
        }
    }
    // sort through array based on number values
    try {
        min = parseInt(arr[num][0]);
    }
    catch (e) {

    }
    minIndex = num;
    for(let x = num; x < arr.length; x++) {
        if (x > num) {
            min = parseInt(arr[x][0]);
            minIndex = x;
        }
        for(let y = x; y < arr.length; y++) {
            if (parseInt(arr[y][0]) < min) {
                min = parseInt(arr[y][0]);
                minIndex = y;
            }
        }
        var temp = arr[minIndex];
        arr[minIndex] = arr[x];
        arr[x] = temp;
    }
    // sort through array using regex expressions
    for(let x = 0; x < num; x++) {
        for(let y = 0; y < num - 1 - x; y++) {
            const aparts = arr[y][0].match(/\s*([a-zA-Z]+)\s*(\d+)\s*/)
            const bparts = arr[y + 1][0].match(/\s*([a-zA-Z]+)\s*(\d+)\s*/)
            if (aparts[1] > bparts[1] || (aparts[1] == bparts[1] && parseInt(aparts[2]) > parseInt(bparts[2]))) {
                [arr[y], arr[y + 1]] = [arr[y + 1], arr[y]];
            }
        }
    }
}

// function for setting up layout based on selected department
async function setupMap(parent) {
        await sortLines(sub1lines);

        // create header for stations
        var header = document.createElement("h1");
        header.classList.add("departmentheader");
        header.textContent = department + " Stations";
        parent.appendChild(header);

        // create left offset value
        var left = 0;
        // create vertical offset value
        var vert = 200;
        // define loop to create all lines and stations
        for(let i = 0; i < sub1lines.length; i++) {
            // create each column[div] to hold all the labels and sliders
            var columnDiv = document.createElement("div");
            columnDiv.classList.add("line");
            columnDiv.textContent = department + " " + lineName + " " + sub1lines[i][0];
            columnDiv.style.left = String(left) + "px";
            columnDiv.style.top = String(vert) + "px";
            left += 230;
            parent.appendChild(columnDiv);
            // define loop to create all individual stations
            for (let r = 0; r < sub1lines[i][1].length; r++) {

                var stationDiv = document.createElement("div")
                stationDiv.classList.add("station")


                var stationID = document.createElement("p");
                // if station cannot be converted to int, it is likely a special station created by user
                if ((parseInt(sub1lines[i][1][r][0]))) {
                    stationID.textContent = "Station " + sub1lines[i][0] + "-" + sub1lines[i][1][r][0];
                }
                else {
                    stationID.textContent = sub1lines[i][1][r][0] + " " + lineName + " " + sub1lines[i][0];
                }
                stationID.classList.add("stationID");
                stationDiv.appendChild(stationID);

                // create ticket link aref for each station
                var ticketID = document.createElement("a");
                ticketID.id = clearwhitespace(stationID.textContent) + "-link";
                stationDiv.id = clearwhitespace(stationID.textContent) + "-border";
                // get ticket link and ID from dynamoDB
                ticketID.innerHTML = "Ticket Link";
                ticketID.href = "[REDACTED FOR PRIVACY]" + sub1lines[i][1][r][2];
                stationDiv.appendChild(ticketID);
                ticketID.style.visibility = "hidden";

                columnDiv.appendChild(stationDiv);
                // call function for creating sliders for each station
                await createSlider(stationDiv, stationID, sub1lines[i][1][r][1], sub1lines[i][0], sub1lines[i][1][r][0], sub1lines[i][1][r][2]);

            }
        }
        // set header values equal to scroll width after adding all the stations
        header.style.width = String(parent.scrollWidth) + "px";
        header.style.top = String(150) + "px";
        document.querySelector("#hr").style.width = String(parent.scrollWidth) + "px";

    }

// function for removing whitespace in id names
function clearwhitespace(str) {
    return str.replace(/\s/g, "")
}

// function for creating a slider to represent station status
async function createSlider(parent, station, str, line, stid) {
    // create slider div element
    var slider = document.createElement("div");
    slider.classList.add("slider");
    // cal functions for creating each slider input
    var issues = await createSliderInput("issues", slider, station, line, stid, str);
    var up = await createSliderInput("up", slider, station, line, stid, str);
    var down = await createSliderInput("down", slider, station, line, stid, str);

    // create circle for slider to represent user selection
    var circle = document.createElement("div");
    circle.classList.add("circle");
    slider.appendChild(circle);

    // append slider to station div
    parent.appendChild(slider); 

    // query select ticket link node
    var link = document.querySelector("#" + clearwhitespace(station.textContent) + "-link");
    // query select station div node
    var border = document.querySelector("#" + clearwhitespace(station.textContent) + "-border")
    // hide station note if station status was pre-selected to corresponding note (if 'up' is selected, hide '-> up <-' p node)
    document.querySelector('#' + str + clearwhitespace(station.textContent) + "-note").style.visibility = "hidden";
    // switch statement for pre-selected slider inputs based on database info
    switch(str) {
        case "up":
            // if station status is up, configure GUI accordingly
            (up).click();
            station.style.color = "white";
            link.style.visibility = "hidden";
            border.style.borderColor = "green";
            break;
        case "down":
            // if station status is down, configure GUI accordingly
            (down).click();
            station.style.color = "red";
            link.style.visibility = "visible";
            border.style.borderColor = "red";
            break;
        case "issues":
            // if station status is issues, configure GUI accordingly
            (issues).click();
            station.style.color = "yellow";
            link.style.visibility = "visible";
            border.style.borderColor = "yellow";
            break;
        default:
            (up).click();
    }

    return slider;
}

// function for creating slider options to represent station status
async function createSliderInput(str, parent, station, line, stid, cstatus) {
    // create input and label
    var input = document.createElement("input");
    var label = document.createElement("label");

    // set htmlFor on label
    label.htmlFor = clearwhitespace(str + "-" + station.textContent);
    // create note on label for visualization purposes
    var note = document.createElement("p");
    note.classList.add("sliderInfo");
    label.classList.add("sliderLabel");
    note.id = str + clearwhitespace(station.textContent) + "-note"

    // configure note based on what type of input this is
    switch(str) {
        case "up":
            note.textContent = "->" + str + "<-";
            note.style.color = "green";
            note.style.top = "-45%"
            break;
        case "down":
            note.textContent = str + "->";
            note.style.color = "red";
            note.style.top = "-45%"
            break;
        case "issues":
            note.textContent = "<-" + str;
            note.style.color = "yellow";
            note.style.top = "-45%"
    }

    label.appendChild(note);
    // add event listener to label when a user clicks it
    label.addEventListener("click", async (event) => {
        var link = document.querySelector("#" + clearwhitespace(station.textContent) + "-link");
        var border = document.querySelector("#" + clearwhitespace(station.textContent) + "-border")
        document.querySelector('#' + str + clearwhitespace(station.textContent) + "-note").style.visibility = "hidden";
        var status;
        var tid;
        selectedStationID =  await getWHID() + "-" + await getDept() + "-" + line + "-" + stid;
        // if ticket does not exist, function should have exception
        // if there is no ticket, mark status as 'closed'
        cstatus = await getStationStatus(selectedStationID);
        try{
            tid = await getTicketID(selectedStationID);
            status = await checkTicketStatus(tid);
        }
        catch(e) {
            status = "Closed";
            console.log(e);
        }
        if (str.includes("up")) {
            if (status == "Closed" || status == "Resolved") {
                station.style.color = "white";
                link.style.visibility = "hidden";
                border.style.borderColor = "green";
                document.querySelector('#down' + clearwhitespace(station.textContent) + "-note").style.visibility = "visible";
                document.querySelector('#issues' + clearwhitespace(station.textContent) + "-note").style.visibility = "visible";
                await updateStation("up", tid);
            }
            else {
                // if ticket is still open, look for actual status, and move input to correct status
                correctInput = document.querySelector(clearwhitespace("#" + cstatus + "-" + station.textContent));
                document.querySelector(clearwhitespace("#" + cstatus + station.textContent + "-note")).style.visibility = "hidden";
                document.querySelector('#up' + clearwhitespace(station.textContent) + "-note").style.visibility = "visible";
                (correctInput).click();
            }
        }
        else if (str.includes("down")) {
            if (status == "Closed" || status == "Resolved") {
                station.style.color = "red";
                var ticketID = await createIssue(station, str);
                link = document.querySelector("#" + clearwhitespace(station.textContent) + "-link")
                link.href = "[REDACTED FOR PRIVACY]" + ticketID;
                link.style.visibility = "visible";
                link.innerHTML = "Ticket Link";
                border.style.borderColor = "red";
                document.querySelector('#up' + clearwhitespace(station.textContent) + "-note").style.visibility = "visible";
                document.querySelector('#issues' + clearwhitespace(station.textContent) + "-note").style.visibility = "visible";
            }
            // if status of ticket is not closed, ticket is still open, so upgrade ticket to being down
            else {
                station.style.color = "red";
                border.style.borderColor = "red";
                document.querySelector('#issues' + clearwhitespace(station.textContent) + "-note").style.visibility = "visible";
                updateStation("down", tid);
            }
        }
        else {
            if (status == "Closed" || status == "Resolved") {
                station.style.color = "yellow";
                let ticketID = await createIssue(station, str);
                link = document.querySelector("#" + clearwhitespace(station.textContent) + "-link")
                link.href = "[REDACTED FOR PRIVACY]" + ticketID;
                link.innerHTML = "Ticket Link";
                link.style.visibility = "visible";
                border.style.borderColor = "yellow";
                document.querySelector('#up' + clearwhitespace(station.textContent) + "-note").style.visibility = "visible";
                document.querySelector('#down' + clearwhitespace(station.textContent) + "-note").style.visibility = "visible";
            }
            // if status of ticket is not closed, ticket is still open, so downgrade ticket to just having issues rather than being down
            else {
                updateStation("issues", tid);
                station.style.color = "yellow";
                border.style.borderColor = "yellow";
                document.querySelector('#down' + clearwhitespace(station.textContent) + "-note").style.visibility = "visible";
            }
        }
    });

    input.id = clearwhitespace(str + "-" + station.textContent);
    input.name = clearwhitespace(station.textContent);
    input.type = "radio";
    input.value = str;

    input.style.zIndex = -1;

    parent.appendChild(input);
    parent.appendChild(label);

    return input;
}