//var express = require('express');
//const { RoboMaker } = require('aws-sdk');

// select pg_terminate_backend(pid) from pg_stat_activity where datname='db'; (database call to remove all connections)

const { Pool } = require('pg');
var format = require('pg-format');

class dbRouter {
    constructor() { // setup database parameters
        this.pool = new Pool({
            user: 'gcpetri',
            host: 'gm-db.cjjxiytdjyjl.us-east-1.rds.amazonaws.com',
            database: 'gmdb',
            password: 'groupmovie',
            post: 5432,
        });
        this.user_id = -1;
        this.username = "";
        this.room_id = -1;
        this.room_code = -1;
        this.is_room_leader = false;
        this.service_ids = "000000";
        console.log('Initiated connection pool');
        this.possible_roomcode = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        this.listener;
        this.service_names = ['HBO', 'DisneyPlus', 'Netflix', 'Hulu', 'PrimeVideo', 'YT'];
    }
    /*
     * prints the settings from class
     */
    print() {
        console.log(this.user_id);
        console.log(this.username);
        console.log(this.room_id);
        console.log(this.room_code);
        console.log(this.is_room_leader);
    }
    /*
     * returns a connection for a client from the class pool
     */
    async connect() {
        //console.log("created connection");
        return this.pool.connect();
    }
    /*
     * creates a listener client thread to receive updates to the database
     */
    async addlistener() {
        this.listener = await this.connect();
        this.listener.on('notification', async(data) => {
            console.log("listener received");
            console.log(data.payload);
        });
        const query = this.listener.query('LISTEN room_event');
        console.log('listener set up');
    }
    /* description: function to add a room and add a user to the room
     * return:
     *    1 if it created a room successfully
     *    2 if the username is too short or not present
     *    3 if the username is too long
     *    0 if the database statment(s) failed
     * TODO: connect to the create room button UI
     */
    async createRoom(username) {
        //console.log(username);
        if (username === undefined || username.length < 3) {
            console.log("ERROR createRoom function:: username of > 2 characters is required");
            return 2;
        } else if (username.length > 12) {
            console.log("ERROR createRoom function:: username of < 13 characters is required");
            return 3;
        }
        this.username = username;
        // make random room code
        var code = "";
        const client = await this.connect();
        let r = '1';
        let queryStr = "";
        while (r != '0') {
            code = "";
            for (var i = 0; i < 4; i++) {
                code += this.possible_roomcode.charAt(Math.floor(Math.random() * this.possible_roomcode.length));
            }
            queryStr = format('SELECT count(*) FROM Room WHERE room_code = %L', code);
            try {
                let res = await client.query(queryStr);
                r = res.rows[0]["count"];
            } catch(err) {
                console.log("ERROR createRoom function:: finding a unique room code");
                client.release();
                return 0;
            }
        }
        this.room_code = code;
        // assign room id
        queryStr = 'SELECT max(room_id) FROM Room';
        try {
            let res = await client.query(queryStr);
            this.room_id = res.rows[0]["max"] + 1;
        } catch(err) {
            console.log("ERROR createRoom function:: finding the proper room id");
            client.release();
            return 0;
        }
        // assign user id
        queryStr = 'SELECT max(user_id) FROM Users';
        try {
            let res = await client.query(queryStr);
            this.user_id = res.rows[0]["max"] + 1;
        } catch(err) {
            console.log("ERROR createRoom function:: finding the proper user id");
            client.release();
            return 0;
        }
        // end this client lifetime
        client.release();
        // add user to database
        try {
            await this.insert('users', ['user_id','room_id','username'], [this.user_id,this.room_id,this.username]);
        } catch(e) {
            console.log("ERROR createRoom function:: insert user entry");
            return 0;
        }
        // add room and user as leader to database
        try {
            await this.insert('room', ["room_id","room_code","user_id"], [this.room_id,this.room_code,this.user_id])
        } catch(e) {
            console.log("ERROR createRoom function:: insert room entry");
            return 0;
        }
        this.is_room_leader = true;
        console.log(this.service_ids);
        await this.initializeSerivces();
        console.log(this.service_ids);
        await this.addlistener(); // add listener for updates to database
        return 1;
    }
    /* description: function to add a user to the room
     * return:
     *    1 if it joined a room successfully
     *    2 if the username is too short or not present
     *    3 if the username is too long
     *    4 if the user is in another room
     *    5 if the username is taken in that room
     *    6 if the room code does not exist
     *    7 if the room code is too short or not present
     *    8 if the room code is too long
     *    0 if the database statment(s) failed
     * TODO: connect to the join room button UI
     */
    async joinRoom(username, roomcode) {
        //if (this.room_id != -1) {
        //    console.log("they are in another room, that's a migration problem for another time");
        //    return 4;
        if (username === undefined || username.length < 3) {
            console.log("ERROR joinRoom function:: username of > 2 characters is required");
            return 2;
        } else if (username.length > 12) {
            console.log("ERROR joinRoom function:: username of < 13 characters is required");
            return 3;
        }
        if (roomcode === undefined || roomcode.length < 4) {
            console.log("ERROR joinRoom funtion:: room code of 4 characters is required");
            return 7;
        } else if (roomcode.length > 4) {
            console.log("ERROR joinRoom function:: room code of 4 characters is required");
            return 8;
        }
        this.is_room_leader = false;
        let queryStr = "";
        const client = await this.connect();
        // assign user id
        queryStr = 'SELECT max(user_id) FROM Users';
        try {
            let res = await client.query(queryStr);
            this.user_id = res.rows[0]["max"] + 1;
        } catch(err) {
            console.log("ERROR joinRoom function:: finding the proper user id");
            client.release();
            return 0;
        }
        // get room id from room code
        queryStr = format('SELECT room_id FROM Room WHERE room_code = %L', roomcode);
        try {
            let res = await client.query(queryStr);
            if (res.rows.length === 0) {
                console.log("ERROR joinRoom function:: could not find room with given code");
                return 6;
            }
            this.room_id = res.rows[0]["room_id"];
        } catch(err) {
            console.log("ERROR joinRoom function:: finding the room id from room code");
            return 0;
        }
        this.room_code = roomcode;
        // check if usernae is taken
        queryStr = format('SELECT count(*) FROM Users WHERE username = %L and room_id = %L', username, this.room_id);
        try {
            let res = await client.query(queryStr);
            let r = res.rows[0]["count"];
            if (r != '0') {
                console.log("ERROR joinRoom function:: username is taken in that room");
                return 5;
            }
            this.username = username;
        } catch(err) {
            console.log("ERROR joinRoom function:: checking if the username is taken");
            return 0;
        }
        // end the client lifetime
        client.release();
        // add user to database
        try {
            await this.insert('Users', ['user_id','room_id','username'], [this.user_id,this.room_id,this.username]);
        } catch(e) {
            console.log("ERROR joinRoom function:: insert user entry");
            return 0;
        }
        return 1;
    }
    /*
     * Description: get the results form the result entity in database
     */
    async refreshResults(final_movies) {
        const client = await this.connect();
        var queryStr = "";
        let res = [];
        //console.log('final_movies ', final_movies);
        try {
            for (var i = 0; i < final_movies.length; i++) {
                var fm_movies = final_movies[i];
                var idx = fm_movies.indexOf('\'');
                if (idx != -1) {
                    fm_movies = fm_movies.substring(0, idx) + '\'' + fm_movies.substring(idx);
                }
                var not_found = true;
                for (var j = 0; j < this.service_names.length && not_found; j++) {
                    queryStr = "SELECT count(*) FROM Movie WHERE TRIM(movie_name) = \'"+fm_movies+"\' AND \""+this.service_names[j]+"\" = 'true'";
                    //console.log(queryStr);
                    let result = await client.query(queryStr);
                    if (result.rows[0]["count"] == 1)
                    {
                        res.push(j+1);
                        not_found = false;
                    }
                }
            }
        } catch(e) {
            console.log("ERROR refreshResults function");
            client.release();
        }
        client.release();
        //console.log(JSON.stringify(res.rows));
        return res;
    }
    /*
     * Description: updates the results entity in database
     */
    async updateResults(final_movies) {
        //console.log(final_movies);
        try {
            for (var i = 0; i < final_movies.length; i++) {
                await this.insert('Result', ['room_id', 'movie_name', 'rank'], [this.room_id, final_movies[i], i]);
            }
        } catch(e) {
            console.log("ERROR updateResults function");
        }
    }
    /*
     * Description: function to add a movie and vote to database
     *   - inserts into movie if movie_name is not already in the Movie entity, then adds a vote to Uservotes
     * params: movie_name - string
     *         vote - boolean
     *
     */
    async addMovieAndVote(movie_name, vote) {
        const client = await this.connect();
        var idx = movie_name.indexOf('\'');
        if (idx != -1) {
            movie_name = movie_name.substring(0, idx) + '\'' + movie_name.substring(idx);
        }
        //console.log(movie_name);
        let movie_id = 10;
        const queryStr = "SELECT movie_id FROM Movie WHERE movie_name = \'"+movie_name+"\'";
        //console.log(queryStr);
        try {
            let res = await client.query(queryStr);
            movie_id = res.rows[0]["movie_id"];
        } catch(e) {
            client.release();
            console.log("ERROR addMovieAndVote function:: find movie_id when the movie's already in the database");
        }
        //}
        // insert into Uservotes
        //console.log("max_movie", max_movie);
        /*
        try {
            await this.insert('Uservotes', ['user_id', 'movie_id', 'vote', 'room_id'], [this.user_id, movie_id, vote, this.room_id]);
        } catch(e) {
            client.release();
            console.log("ERROR addMovieAndVote function:: insert into Uservotes");
        }
        */
        // insert into Roomvotes
        if (vote == true) {
            const queryStr3 = format("SELECT count(*) FROM Roomvotes WHERE movie_id = %L AND room_id = %L", movie_id, this.room_id);
            try {
                let res = await client.query(queryStr3);
                var count2 = res.rows[0]["count"];
                if (count2 != 0) { // movie is in Roomvotes
                    const queryStr4 = format("UPDATE Roomvotes SET num_votes = num_votes + 1 WHERE movie_id = %L AND room_id = %L", movie_id, this.room_id);
                    await client.query(queryStr4);
                } else { // movie is not in Roomvotes
                    await this.insert('Roomvotes', ['room_id', 'movie_id', 'num_votes'], [this.room_id, movie_id, 1]);
                }
            } catch(e) {
                client.release();
                console.log("ERROR addMovieAndVote function:: insert into Roomvotes");
            }
        }
        client.release();
    }

    /*
     * 
     */
    async getMoviesFromServices() {

        const client = await this.connect();
        //this.service_ids = "001000";
        var index;
        do {
          index = Math.floor(Math.random()*6);
          //console.log(index);
        }while(this.service_ids[index] == "0");

        //console.log(index);

        var services = ["HBO","DisneyPlus","Netflix","Hulu","PrimeVideo","YT"];
        var res;
        const queryStr = "SELECT Movie.movie_name FROM Movie WHERE \""+services[index]+"\" = 'true' ORDER BY RANDOM() LIMIT 1"
        //console.log(queryStr);
        try {
            res = await client.query(queryStr);
            //console.log(res.rows);

        } catch (e) {
            client.release();
            console.log("ERROR getMoviesFromServices function: getting movies from netflix");
        }

        client.release();
        return res.rows;
    }
    async searchMovieFromServices(movie) {
        const client = await this.connect();
        let res;
        let result;
        //console.log("service_ids", this.service_ids);
        var idx = movie.indexOf('\'');
        if (idx != -1) {
            movie = movie.substring(0, idx) + '\'' + movie.substring(idx);
        }
        for (var i = 0; i < this.service_ids.length; i++) {
            if (this.service_ids[i] == '1') {
                let queryStr = "SELECT max(movie_name) FROM Movie WHERE movie_name ~* \'"+movie+"\' AND \""+this.service_names[i]+"\" = 'true'";
                //console.log(queryStr);
                try {
                    res = await client.query(queryStr);
                    //console.log(res);
                    if (res.rows.length > 0)
                        result = res.rows[0]["max"];
                    if (result != null)
                        break;
                } catch(e) {
                    client.release();
                    console.log("ERROR searchMoviesFromServices function: searching movies from service");
                }
            }
        }
        //console.log(result);
        client.release();
        return result;
    }

    /*
     * Description: generic insert function
     * params:
     *      'table' - string (the database entity name)
     *      'columns' - array of strings (the database entity's columns names)
     *      'values' - array of string (the database entity's new column values)
     * throws:
     *      ERROR exception if the parameters are incorrect or insert statment fails
     */
    async insert(table, columns, values) {
        if (!Array.isArray(columns) || !Array.isArray(values)) {
            console.log("ERROR insert function:: need array objects for columns and values parameters.");
            throw new Error('insert');
        }
        else if (columns.length != values.length) {
            console.log("ERROR insert function:: need columns and values parameters to be the same length.");
            throw new Error('insert');
        }
        const queryStr = format('INSERT INTO %s(%s) VALUES(%L)', table, columns, values);
        //console.log(queryStr);
        const client = await this.connect();
        try {
            await client.query(queryStr);
            //console.log("insert successful");
        } catch(err) {
            console.log("ERROR insert function:: error inserting values");
            client.release();
            throw new Error('insert');
        }
        client.release();
    }
    /*
     * returns a json array of the top 8 movie names
     *
     */
    async getLeaderBoard() {
        const client = await this.connect();
        const queryStr = format("SELECT Movie.movie_name FROM Movie INNER JOIN Roomvotes ON Movie.movie_id = Roomvotes.movie_id WHERE room_id = %L ORDER BY Roomvotes.num_votes DESC LIMIT 8", this.room_id);
        //const queryStr = format("SELECT Movie.movie_name, Roomvotes.num_votes FROM Movie, Roomvotes WHERE room_id = %L ORDER BY Roomvotes.num_votes DESC LIMIT 8", this.room_id);
        try {
            let res = await client.query(queryStr);
            //console.log(res.rows);
            client.release();
            return res.rows;
        } catch (e) {
            client.release();
            console.log("ERROR getLeaderBoard function:: getting top 8 movie names");
        }
    }
    /*
     * Description: populates the Tournament entity in the database
     */
    async populateTournament() {
        const client = await this.connect();
        const queryStr = format("SELECT * FROM Movie INNER JOIN Roomvotes ON Movie.movie_id = Roomvotes.movie_id WHERE room_id = %L ORDER BY Roomvotes.num_votes DESC LIMIT 8", this.room_id);
        //console.log("top 8 movies");
        let res;
        let result;
        try {
            res = await client.query(queryStr);
            result = res.rows;
        } catch(error) {
            console.log("ERROR populateTournament function:: getting top 8 movies");
            client.release();
        }
        //console.log(result);
        try {
            for (var i = 0; i < result.length; i++) {
                await this.insert('Tournament', ['room_id', 'movie_id', 'movie_rank', 'movie_votes', 'movie_in', 'movie_name'], [this.room_id, result[i]["movie_id"], i+1, 0, true, result[i]["movie_name"]]);
            }
        } catch(error) {
            console.log("ERROR populateTournament function:: inserting into Tournament entity");
            client.release();
        }
        let list = [];
        for (var i = 0; i < result.length; i++) {
            list.push(result[i]["movie_name"]);
        }
        client.release();
        return list;
    }
    /*
     * returns:
     *     room data - array [room id, room code, room leader (user id), is room leader (boolean)]
     */
    getRoom() {
        return [this.room_id, this.room_code, this.room_leader, this.is_room_leader];
    }
    /*
     * returns:
     *     user data - array [user id, room code, username]
     */
    getUser() {
        return [this.user_id, this.room_code, this.username];
    }
    /*
     * returns:
     *     movieids - string (available = 1, not available = 0)
     *          order = HBOMAX, DisneyPlus, Netflix, Hulu, Prime, YoutubeTV
     */
    getServices() {
        return this.service_ids;
    }
    /*
     * Description: performs database query to attain the usernames of everyone in the room
     * returns:
     *     all usernames - array [this.username, ...]
     */
    async selectUsers() {
        if (this.room_id == -1) {
            throw new Error('select Users');
        }
        const queryStr = format('SELECT * FROM Users WHERE room_id = %s', this.room_id);
        //console.log(queryStr);
        const client = await this.connect();
        try {
            let res = await client.query(queryStr);
            var r = [];
            for(var i = 0; i < res.rowCount; i++) {
                r.push(res.rows[i]["username"]);
            }
            client.release();
            return r;
        } catch(err) {
            console.log("ERROR in selectUsers function");
            client.release();
            throw new Error('select Users');
        }
    }
    /*
     * Description: updates database with available streaming services
     * parameters: serviceids - string (length 6 for the 6 streaming services (1 if available, 0 if not))
     * returns:
     *     1 - if the update was successful
     *     0 - if the database call failed
     *     2 - if the service ids parameter is of incorrect length
     */
    async updateServices(serviceids) {
        //console.log('dbRouter: ', serviceids);
        if (serviceids.length != 6) {
            console.log("ERROR selectUsers function:: service ids parameter incorrect length");
            return 2;
        } else if (serviceids == this.service_ids) {
            console.log("The services are the same");
            return 1;
        }
        var yes_indices = [];
        var no_indices = [];
        for (var i = 0; i < serviceids.length; i++) {
            //if (serviceids[i] != this.service_ids[i]) { // they are different
                if (serviceids[i] == "1")
                    yes_indices.push(i+1);
                else
                    no_indices.push(i+1);
            //}
        }
        const client = await this.connect();
        const queryStr = format("UPDATE Roomservices as s SET available = c.available, service_id = s.service_id, room_id = s.room_id FROM (VALUES(false)) as c(available) WHERE room_id = %s AND service_id in (%L)",
        this.room_id, no_indices);
        //console.log(queryStr);
        const queryStr2 = format("UPDATE Roomservices as s SET available = c.available, service_id = s.service_id, room_id = s.room_id FROM (VALUES(true)) as c(available) WHERE room_id = %s AND service_id in (%L)",
        this.room_id, yes_indices);
        //console.log(queryStr2);
        try {
            if (no_indices.length != 0)
                await client.query(queryStr);
            if (yes_indices.length != 0)
                await client.query(queryStr2);
            client.release();
        } catch(e) {
            client.release();
            console.log("ERROR updateServices function");
            return 0;
        }
        this.service_ids = serviceids;
        //console.log('this.service_ids', this.service_ids);
        return 1;
    }
    /*
     * get the services in the database
     *
     */
    async refreshServices() {
        const client = await this.connect();
        const queryStr = format('SELECT available FROM Roomservices WHERE room_id = %L ORDER BY service_id ASC', this.room_id);
        //console.log(queryStr);
        try {
            var res = await client.query(queryStr);
            //console.log(res.rows);
            this.service_ids = "";
            for (var i = 0; i < res.rows.length; i++) {
                if (res.rows[i]["available"] == true) {
                    this.service_ids += "1";
                } else {
                    this.service_ids += "0";
                }
            }
        } catch(e) {
            client.release();
            this.service_ids = "000000";
            console.log("ERROR refreshing services function");
            return this.service_ids;
        }
        console.log(this.service_ids);
        client.release();
        return this.service_ids;
    }
    /*
     * Description: updates database to hold all the streaming services for the room
     * returns:
     *     1 - if the update was successful
     *     0 - if the database call failed
     */
    async initializeSerivces() {
        const queryStr = "INSERT INTO Roomservices VALUES("+this.room_id+",1,false),("+this.room_id+",2,false),("+this.room_id+",3,false),("+this.room_id+",4,false),("+this.room_id+",5,false),("+this.room_id+",6,false)";
        //console.log(queryStr);
        const client = await this.connect();
        try {
            await client.query(queryStr);
            client.release();
        } catch(e) {
            client.release();
            console.log("ERROR initializeServices function");
            return 0;
        }
        return 1;
    }
    /*
     * returns:
     *     if the user is the room leader - bool
     */
    isLeader() {
        return this.is_room_leader;
    }
    async leave_room() {
        const client = await this.connect();
        var queryStr = "";
        try {
            queryStr = format("DELETE FROM Roomservices WHERE room_id = %L", this.room_id);
            await client.query(queryStr);
            queryStr = format("DELETE FROM Users WHERE user_id = %L", this.user_id);
            await client.query(queryStr);
            queryStr = format("DELETE FROM Room WHERE user_id = %L", this.user_id);
            await client.query(queryStr);
            queryStr = format("DELETE FROM Tournament WHERE room_id = %L", this.room_id);
            await client.query(queryStr);
            queryStr = format("DELETE FROM Result WHERE room_id = %L", this.room_id);
            await client.query(queryStr);
            queryStr = format("DELETE FROM Roomvotes WHERE room_id = %L", this.room_id);
            await client.query(queryStr);
            queryStr = format("DELETE FROM Uservotes WHERE user_id = %L", this.user_id);
            await client.query(queryStr);
        } catch(e) {
            client.release();
            console.log("ERROR leave room function");
        }
        client.release();
    }
    /*
     * Description: ends everything with the room_id
     */
    async close_room() {
        const client = await this.connect();
        var queryStr = "";
        try {
            queryStr = format("DELETE FROM Roomservices WHERE room_id = %L", this.room_id);
            await client.query(queryStr);
            queryStr = format("DELETE FROM Users WHERE room_id = %L", this.room_id);
            await client.query(queryStr);
            queryStr = format("DELETE FROM Room WHERE room_id = %L", this.room_id);
            await client.query(queryStr);
            queryStr = format("DELETE FROM Tournament WHERE room_id = %L", this.room_id);
            await client.query(queryStr);
            queryStr = format("DELETE FROM Result WHERE room_id = %L", this.room_id);
            await client.query(queryStr);
            queryStr = format("DELETE FROM Roomvotes WHERE room_id = %L", this.room_id);
            await client.query(queryStr);
            queryStr = format("DELETE FROM Uservotes WHERE room_id = %L", this.room_id);
            await client.query(queryStr);
        } catch(e) {
            client.release();
            console.log("ERROR close_room function");
        }
        client.release();
    }
    /*
     * description: ends the pool connections
     */
    async destroy() {
        if (this.listener !== undefined)
            this.listener.release();
        if (this.pool !== undefined)
            this.pool.end();
        console.log("ended connection pool");
    }
}

// let the express app use it
module.exports = dbRouter;
/*
// tests
const d = new dbRouter();
(async () => {
    const c = await d.createRoom('greg');
    //await d.updateServices('101100');
    //d.print();
    //console.log("Created Room? Error code: ", c);
    //const j = await d.joinRoom('brit','ZBYJ');
    //let data = await d.selectUsers();
    //await d.initializeSerivces();
    //const e = await d.updateServices('111010');
    //console.log(e);
    //console.log(d.getServices());
    //await d.addMovieAndVote('Coco', true);
    //await d.addMovieAndVote("The Emperor's New Groove", true);
    //await d.addMovieAndVote('Thor', true);
    //await d.addMovieAndVote('Last Summer', true);
    //await d.addMovieAndVote('Last Summer', true);
    //await d.addMovieAndVote('A wrinkle in time', true);
    //await d.addMovieAndVote('bay watch', true);
    await d.addMovieAndVote('Chicken Little', true);
    //await d.addMovieAndVote('rick and morty', true);
    //await d.addMovieAndVote('avatar', true);
    //let deets = await d.populateTournament();
    //console.log(deets);
    //var deets = await d.getLeaderBoard();
    //console.log(deets);
    //let cap = await d.getMoviesFromServices();
    //console.log(cap);
    //let cap = await d.refreshResults([ 'Coco', "The Emperor's New Groove", 'Last Summer', 'Chicken Little' ]);
    //console.log(cap);
    await d.leave_room();
    await d.destroy();
    console.log("Create Room? Error code: ", c);
})();
*/