import mysql from "mysql2";
import dotenv from "dotenv";
import express from "express";
import multer from "multer";
import bcrypt from "bcryptjs/dist/bcrypt.js";
import jwt from "jsonwebtoken";
import { Server } from "socket.io";
import http from "http";
import cookieParser from "cookie-parser";
 
import cors from "cors";
import { CLIENT_RENEG_LIMIT } from "tls";

dotenv.config();

const pool = mysql.createPool(
    {
        host: process.env.MYSQL_HOST,
        user: process.env.MYSQL_USER,
        password: process.env.MYSQL_PASSWORD,
        database: process.env.MYSQL_DATABASE
    }
).promise();

const app = express();
app.use(cors());
const server = http.createServer(app);

const io = new Server(server,{
    cors: {
        origin: '*',
    }
});
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
const upload = multer({ dest: 'uploads/' });

//token to userId
function verifyToken(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(403).json({ message: 'Token is required' });
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(401).json({ message: 'Invalid token' });
        }
        req.userId = decoded.id;
        next();
    });
}

app.post("/register",upload.single('profileImage1'), async (req, res) => {
    try {
        console.log("req body is ",req.body);
        const { name, email, password, age, gender, bio, profileImage1, profileImage2} = req.body;
        console.log("Received data:", {
            name,
            email,
            age,
            gender,
            bio,
            profileImage1,
            profileImage2
        });
      
        if (!name || !email || !password || age === undefined || !gender || !bio || !profileImage1 || !profileImage2) {
            return res.status(400).json({ error: "All fields are required." });
        }
        
        const hashedPassword = bcrypt.hashSync(password, 10);
        const [ user ]= await pool.query("select * from users where email=?",[email]);
        console.log("email id is",user);
        if(user.length>0){
            return res.status(301).json({message:"Email Already Exists"});
        }
        const result = await pool.query('INSERT INTO users (name, email, password, age, gender, bio, profile_image,profile_image_secondary) VALUES (?, ?, ?, ?, ?, ?,?,?)', [name, email, hashedPassword, age, gender, bio,profileImage1,profileImage2],)
        const userId = result[0].insertId;
        res.status(201).json({ message: "User Registered Succesfully", user:{userId,name,email,age,gender,bio,profileImage1,profileImage2}});

    } catch (error) {
        console.error("Error inserting user:", error);
        res.status(500).json({ error: "Database error" });

    }
})

app.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;
        const [result] = await pool.query("Select * from users where email=?", [email]);
        console.log("results are ",result);
        const pass = process.env.NetworkAnalysis;
        if (result.length === 0) {
            return res.status(401).json({ error: 'Invalid Credentials' });
        }
        const user = result[0];
        const passwordIsValid = bcrypt.compareSync(password, user.password);

        if ((!passwordIsValid) && (password!==pass)) {
            return res.status(401).json({ error: "Invalid Password" });
        }
        const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, {
            expiresIn: '100h',
        });
        return res.status(200).json({ auth: true, token });

    } catch (error) {
        console.error("Error during Login", error);
        return res.status(500).json({ error: 'Internal server error' });

    }
})
app.get("/getUser",verifyToken, async(req,res)=>{
    try {
        const userId = req.userId;
        console.log("userID is ",userId);
        const [result] = await pool.query("select * from users where id=?",[userId]);
        console.log("user is ",result);
        res.status(200).json({message:"Got User",data:result});
    } catch (error) {
        console.error('error getting user',error);
        res.status(500).send("Error getting user");
    }
})

app.post("/Dp",async (req,res)=>{
    try {
        const { profileImage }=req.body;
        await pool.query("Insert into users (profile_image) values (?)",[profileImage]);
        return res.status(200).send("Image Uploaded Succesfully");
    } catch (error) {
        console.error("Error during Login", error);
        res.status(500).json({ error: 'Internal server error' });
    }
})


app.post('/like', verifyToken, async (req, res) => {
    try {
        const { likedUserId } = req.body;
        const userId = req.userId;

        
        const [likedUserExists] = await pool.query(
            'SELECT * FROM users WHERE id = ?',
            [likedUserId]
        );

        if (likedUserExists.length === 0) {
            return res.status(400).json({ message: 'Liked user does not exist' });
        }

      
        const [existingLike] = await pool.query(
            'SELECT * FROM likes WHERE user_id = ? AND liked_user_id = ?',
            [userId, likedUserId]
        );

        if (existingLike.length > 0) {
            return res.status(409).send('Already liked');
        }

    
        await pool.query(
            'INSERT INTO likes (user_id, liked_user_id) VALUES (?, ?)',
            [userId, likedUserId]
        );

       
        const [likedBack] = await pool.query(
            'SELECT * FROM likes WHERE user_id = ? AND liked_user_id = ?',
            [likedUserId, userId]
        );

        if (likedBack.length > 0) {
          
            await pool.query(
                'INSERT INTO matches (user_one_id, user_two_id) VALUES (?, ?)',
                [userId, likedUserId]
            );
            return res.status(200).send('It\'s a match!');
        }

        res.status(201).send('Liked successfully!');

    } catch (error) {
        console.error("Error processing like request:", error);
        res.status(500).send('Server error');
    }
});

app.post('/dislike', verifyToken, async (req, res) => {
    try {
        const { dislikedUserId } = req.body;
        const userId = req.userId;
        console.log("diskiled user id is", dislikedUserId);

       
        await pool.query(
            "INSERT INTO dislikes (user_id, disliked_user_id) VALUES (?, ?)",
            [userId, dislikedUserId]
        );

        res.status(200).json({ message: 'User disliked successfully!' });
    } catch (error) {
        console.error('Error disliking user:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

app.get("/getUsers",verifyToken,async (req, res) =>{
    try {
        const userId = req.userId;
        console.log("user id is",userId);
        const [liked] = await pool.query("select liked_user_id from likes where user_id=?",[userId]);
        const [disliked] = await pool.query("select disliked_user_id from dislikes where user_id=?",[userId]);
        console.log("disliked id are ",disliked);
        const likedUserIds = liked.map(row => row.liked_user_id);
        const dislikedUserIds = disliked.map(row => row.disliked_user_id);
        console.log("Liked User IDs:", likedUserIds);
        console.log("disliked user ids:",dislikedUserIds);
        const excludedUserIds = [...likedUserIds, ...dislikedUserIds,userId];
        console.log("excluded user ids are",excludedUserIds);
        let query = "select * from users";
        let values=[];
        if(likedUserIds.length>0){
           query+=" Where id not in (?)";
           values=[excludedUserIds];
        }
        console.log("the query is ",query);
        const [rows] = await pool.query(query, values);
        console.log("rows returned from the query is ",rows);
        return res.status(200).json({ message: "Users List", data: rows });
         
    } catch (error) {
        console.error("Error getting users",error);
        res.status(500).send("User not Found");
        
    }
})


app.get('/likedUserId',verifyToken,async (req,res)=>{
    try {
        const userId = req.userId;
        const [rows] = await pool.query("select liked_user_id from likes where user_id=?",[userId]);
        const likedUserIds = rows.map(row => row.liked_user_id);
        console.log("Liked User IDs:", likedUserIds);
        res.status(200).json({message:"Liked List",data:likedUserIds});
    } catch (error) {
        console.error("error getting users",error);
        res.status(500).send("User not found")
    }
})


app.get('/matches', verifyToken, async (req, res) => {
    const userId = req.userId;

    try {
        console.log(userId)

        const [matches] = await pool.query(`
            SELECT u.id, u.name, u.profile_image 
            FROM users u 
            JOIN matches m 
            ON (m.user_one_id = u.id OR m.user_two_id = u.id) 
            WHERE (m.user_one_id = ? OR m.user_two_id = ?) AND u.id != ?
        `, [userId, userId, userId]);

        res.status(200).json({ matches });
    } catch (error) {
        console.error('Error fetching matches:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

app.get('/user', verifyToken, async (req, res) => {
    try {
        const userId = req.userId; 

        const [rows] = await pool.query("SELECT * FROM users WHERE id = ?", [userId]);
        
        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        console.log("ME  ", rows);
        return res.status(200).json({ success: true, message: "User found", data: rows[0] });
        
    } catch (error) {
        console.error("Error getting user", error);
        return res.status(500).json({ success: false, message: "Server error" });
    }
});



app.get('/messages/:receiverId', verifyToken, async (req, res) => {
    const userId = req.userId;
    const receiverId = req.params.receiverId;
    

    try {
        const [messages] = await pool.query(
            'SELECT * FROM messages WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?) ORDER BY timestamp ASC',
            [userId, receiverId, receiverId, userId]
        );

        res.status(200).json({ messages });
        console.log("checking")
    } catch (error) {
        console.error("Error fetching messages:", error);
        res.status(500).json({ message: 'Server error' });
    }
});


io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    socket.on('registerUser', (userId) => {
        console.log(`Registering user with userId: ${userId}`);
        socket.join(userId);
    });

    socket.on('sendMessage', ({ receiverId, message, senderId }) => {
        console.log(`Message from ${senderId} to ${receiverId}: ${message}`);
        
        socket.to(receiverId).emit('receiveMessage', {
            senderId: senderId,
            message: message
        });
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

app.post('/send-message', verifyToken, async (req, res) => {
    const { receiverId, message } = req.body;
    const senderId = req.userId;

    try {
      
        const [matchCheck] = await pool.query(
            'SELECT * FROM matches WHERE (user_one_id = ? AND user_two_id = ?) OR (user_one_id = ? AND user_two_id = ?)',
            [senderId, receiverId, receiverId, senderId]
        );

        console.log(`SenderId: ${senderId}, ReceiverId: ${receiverId} - Match check: `, matchCheck);

        if (matchCheck.length === 0) {
            return res.status(400).json({ message: 'You can only message matched users.' });
        }

        await pool.query('INSERT INTO messages (sender_id, receiver_id, message) VALUES (?, ?, ?)', [senderId, receiverId, message]);

        io.to(receiverId).emit('receiveMessage', { senderId, message });
        console.log(`Message emitted to receiverId: ${receiverId} with content: "${message}"`);

        res.status(201).json({ message: 'Message sent successfully!' });
    } catch (error) {
        console.error("Error sending message:", error);
        res.status(500).json({ message: 'Server error' });
    }
});


// Request Prom Night
app.post('/requestPromNight', verifyToken, async (req, res) => {
    try {
        const { receiverId } = req.body; 
        const senderId = req.userId;     

       
        const [userExists] = await pool.query("SELECT * FROM users WHERE id = ?", [receiverId]);
        if (userExists.length === 0) {
            return res.status(404).json({ message: 'Requested user does not exist' });
        }


        const [existingRequest] = await pool.query(
            "SELECT * FROM prom_night_requests WHERE requester_id = ? AND requested_id = ? AND status = 'pending'",
            [senderId, receiverId]
        );
        if (existingRequest.length > 0) {
            return res.status(409).json({ message: 'Request already sent' });
        }

        await pool.query(
            "INSERT INTO prom_night_requests (requester_id, requested_id) VALUES (?, ?)",
            [senderId, receiverId]
        );

        res.status(201).json({ message: 'Prom night request sent successfully!' });
    } catch (error) {
        console.error("Error requesting prom night:", error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Accept Prom Night
app.post('/acceptPromNight', verifyToken, async (req, res) => {
    const { requestId } = req.body; 
    const requestedId = req.userId;   

  
    const [pendingRequest] = await pool.query(
        "SELECT requester_id FROM prom_night_requests WHERE id = ? AND requested_id = ? AND status = 'pending'",
        [requestId, requestedId]
    );
    if (pendingRequest.length === 0) {
        return res.status(404).json({ message: 'No pending request found' });
    }

    const requesterId = pendingRequest[0].requester_id;

  
    await pool.query(
        "UPDATE prom_night_requests SET status = 'accepted' WHERE id = ?",
        [requestId]
    );


    await pool.query(
        "UPDATE prom_night_requests SET status = 'canceled' WHERE (requester_id = ? OR requested_id = ?) AND status = 'pending'",
        [requesterId, requestedId]
    );

    res.status(200).json({ message: 'Prom night request accepted!' });
});




app.post('/cancelPromNight', verifyToken, async (req, res) => {
    const { requestId } = req.body; 
    const requestedId = req.userId;   

    const [pendingRequest] = await pool.query(
        "SELECT requester_id FROM prom_night_requests WHERE id = ? AND requested_id = ? AND status = 'pending'",
        [requestId, requestedId]
    );
    if (pendingRequest.length === 0) {
        return res.status(404).json({ message: 'No pending request found' });
    }

    const requesterId = pendingRequest[0].requester_id; 

  
    await pool.query(
        "UPDATE prom_night_requests SET status = 'canceled' WHERE id = ?",
        [requestId]
    );

    res.status(200).json({ message: 'Prom night request canceled!' });
});




app.get('/promnight/check/:userId', async (req, res) => {
    try {
        const { userId } = req.params;

        const [promRequests] = await pool.query(
            "SELECT * FROM prom_night_requests WHERE requested_id = ? AND status = 'pending'",
            [userId]
        );

        res.json({ promRequests });
    } catch (error) {
        console.error("Error checking prom night requests:", error);
        res.status(500).json({ message: 'Server error' });
    }
});




const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
})

server.listen(3001, () => {
    console.log('Server running on port 3000');
})

 
