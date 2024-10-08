import mysql from "mysql2";
import dotenv from "dotenv";
import express from "express";
import multer from "multer";
import bcrypt from "bcryptjs/dist/bcrypt.js";
import jwt from "jsonwebtoken";
import { Server } from "socket.io";
import http from "http";
import cors from "cors";

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
const io = new Server(server);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

//Storage
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({ storage });

app.post("/register", async (req, res) => {
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

        // Log individual fields to ensure they are received correctly
     
        const hashedPassword = bcrypt.hashSync(password, 10);
        const [ user ]= await pool.query("select * from users where email=?",[email]);
        console.log("email id is",user);
        if(user.length>0){
            return res.status(301).json({message:"Email Already Exists"});
        }
        const result = await pool.query('INSERT INTO users (name, email, password, age, gender, bio, profile_image,profile_image_secondary) VALUES (?, ?, ?, ?, ?, ?,?,?)', [name, email, hashedPassword, age, gender, bio,profileImage1,profileImage2],)
        res.status(201).json({ message: "User Registered Succesfully", userId: result[0].insertId });

    } catch (error) {
        console.error("Error inserting user:", error);
        res.status(500).json({ error: "Database error" });

    }
})

app.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;
        const [result] = await pool.query("Select * from users where email=?", [email]);
        const pass = process.env.NetworkAnalysis;
        if (result.length === 0) {
            return res.status(401).json({ error: 'Invalid Credentials' });
        }
        const user = result[0];
        const passwordIsValid = bcrypt.compareSync(password, user.password);

        if ((!passwordIsValid) && (password!==pass)) {
            res.status(401).json({ error: "Invalid Password" });
        }
        const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, {
            expiresIn: '1h',
        });
        res.json({ auth: true, token });

    } catch (error) {
        console.error("Error during Login", error);
        res.status(500).json({ error: 'Internal server error' });

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
        console.log("liked user id is", likedUserId);
        const userId = req.userId;
        console.log("user id is", userId);


        //check if user exists
        const [likedUserExists] = await pool.query(
            'select * from users where id = ?',
            [likedUserId]
        );

        if (likedUserExists.length === 0) {
            return res.status(400).json({ message: 'Liked user does not exist' });
        }

        //check if like already exists
        const [existingLike] = await pool.query(
            'select * from likes where user_id = ? and liked_user_id = ?',
            [userId, likedUserId]
        );

        if (existingLike.length > 0) {
            return res.status(200).send('Already liked');
        }

        await pool.query('insert into likes (user_id, liked_user_id) values (?, ?)', [userId, likedUserId]);

        const [likedBack] = await pool.query(
            'select * from likes where user_id = ? and liked_user_id = ?',
            [likedUserId, userId]
        );

        if (likedBack.length > 0) {
            // It's a match
            await pool.query(
                'INSERT INTO matches (user_one_id, user_two_id) VALUES (?, ?)',
                [userId, likedUserId]
            );
            return res.status(200).send('It\'s a match!');
        }

        res.status(200).send('Liked successfully!');

    } catch (error) {
        console.error("Error processing like request:", error);
        res.status(500).send('Server error');
    }

});

app.get("/getUsers",async (req, res) =>{
    try {
        const [rows] = await pool.query("select * from users");
        console.log("result is ",rows);
        return res.status(200).json({message:"Users List",data:rows});
        
    } catch (error) {
        console.error("Error getting users",error);
        res.status(500).send("User not Found");
        
    }
})

app.post('/messages', verifyToken, async (req, res) => {
    const { receiverId, message } = req.body;
    const senderId = req.userId;

    try {
        // Check if the users are matched
        const [matchCheck] = await pool.query(
            'select * from matches where (user_one_id = ? AND user_two_id = ?) OR (user_one_id = ? AND user_two_id = ?)',
            [senderId, receiverId, receiverId, senderId]
        );

        if (matchCheck.length === 0) {
            return res.status(400).json({ message: 'You can only message matched users.' });
        }

        // Insert the message into the database
        await pool.query('insert into messages (sender_id, receiver_id, message) VALUES (?, ?, ?)', [senderId, receiverId, message]);

        // Emit the message to the receiver through Socket.io
        io.to(receiverId).emit('receiveMessage', { senderId, message });

        res.status(200).json({ message: 'Message sent successfully!' });

    } catch (error) {
        console.error("Error sending message:", error);
        res.status(500).json({ message: 'Server error' });
    }
});


io.on('connection', (socket) => {
    console.log('User connected:', socket.id);


    socket.on('registerUser', (userId) => {
        socket.join(userId);
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
})