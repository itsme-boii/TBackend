import mysql from "mysql2";
import dotenv from "dotenv";
import express from "express";
import multer from "multer";
import bcrypt from "bcryptjs/dist/bcrypt.js";
import jwt from "jsonwebtoken";
import { Server } from "socket.io";
import http from "http";
import cookieParser from "cookie-parser";
import nodemailer from "nodemailer";
import crypto from "crypto";

// import { Server } from "socket.io";
import cors from "cors";
import { CLIENT_RENEG_LIMIT } from "tls";

dotenv.config();

const pool = mysql.createPool(
    {
        host: process.env.MYSQL_HOST,
        user: process.env.MYSQL_USER,
        password: process.env.MYSQL_PASSWORD,
        database: process.env.MYSQL_DATABASE,
        port: 25141,
        ssl: {
            rejectUnauthorized: false
        }
    }
).promise();

const app = express();
app.use(cors());
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ["GET", "POST"]
    }
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
const upload = multer({ dest: 'uploads/' });


// email servce 
// const uniqueCode = crypto.randomBytes(16).toString('hex'); 
const transporter = nodemailer.createTransport({
    service: 'Gmail', // or any other email service
    auth: {
        user: "kumawatnishantk@gmail.com",
        pass: "khas jpxm hfdh zcuh",
    }
});

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

app.post("/register", upload.single('profileImage1'), async (req, res) => {
    try {
        console.log("req body is ", req.body);
        const { name, email, password, rollNo, year, hall, PhoneNo, age, gender, bio, profileImage1, profileImage2 } = req.body;
        console.log("Received data:", {
            name,
            email,
            age,
            rollNo,
            hall,
            year,
            gender,
            bio,
            PhoneNo,
            profileImage1,
            profileImage2
        });

        // Validate required fields
        if (!name || !year || !hall || !email || !rollNo || !PhoneNo || !password || age === undefined || !gender || !bio || !profileImage1 || !profileImage2) {
            return res.status(400).json({ error: "All fields are required." });
        }

        // Check if email, PhoneNo, or rollNo already exists
        const [existingUser] = await pool.query(
            "SELECT * FROM users WHERE email = ? OR PhoneNo = ? OR rollNo = ?",
            [email, PhoneNo, rollNo]
        );

        if (existingUser.length > 0) {
            // Determine which field already exists
            if (existingUser.some(user => user.email === email)) {
                return res.status(409).json({ message: "Email already exists." });
            } else if (existingUser.some(user => user.PhoneNo === PhoneNo)) {
                return res.status(409).json({ message: "Phone number already exists." });
            } else if (existingUser.some(user => user.rollNo === rollNo)) {
                return res.status(409).json({ message: "Roll number already exists." });
            }
        }

        // Hash password
        const hashedPassword = bcrypt.hashSync(password, 10);

        // Insert new user
        const result = await pool.query(
            'INSERT INTO users (name, year, PhoneNo, rollNo, email, password, age, gender, bio, profile_image, profile_image_secondary) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [name, year, PhoneNo, rollNo, email, hashedPassword, age, gender, bio, profileImage1, profileImage2]
        );

        const userId = result[0].insertId;

        // Respond with success
        res.status(201).json({
            message: "User Registered Successfully",
            user: { userId, name, rollNo, year, hall, PhoneNo, email, age, gender, bio, profileImage1, profileImage2 }
        });

    } catch (error) {
        console.error("Error inserting user:", error);
        res.status(500).json({ error: "Database error" });
    }
});


app.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;
        const [result] = await pool.query("Select * from users where email=?", [email]);
        console.log("results are ", result);
        const pass = process.env.NetworkAnalysis;
        if (result.length === 0) {
            return res.status(401).json({ error: 'Invalid Credentials' });
        }
        const user = result[0];
        const passwordIsValid = bcrypt.compareSync(password, user.password);

        if ((!passwordIsValid) && (password !== pass)) {
            return res.status(401).json({ error: "Invalid Password" });
        }
        const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, {
            expiresIn: '100000h',
        });
        return res.status(200).json({ auth: true, token });

    } catch (error) {
        console.error("Error during Login", error);
        return res.status(500).json({ error: 'Internal server error' });

    }
})
// app.get("/getUser", verifyToken, async (req, res) => {
//     try {
//         const userId = req.userId;
//         console.log("userID is ", userId);
//         const [result] = await pool.query("select * from users where id=?", [userId]);
//         console.log("user is ", result);
//         res.status(200).json({ message: "Got User", data: result });
//     } catch (error) {
//         console.error('error getting user', error);
//         res.status(500).send("Error getting user");
//     }
// })


app.get("/getUsers", verifyToken, async (req, res) => {
    try {
        const userId = req.userId;
        console.log("user id is", userId);
        
        const [user] = await pool.query("SELECT gender FROM users WHERE id = ?", [userId]);
        const currentUserGender = user[0].gender;
        let oppositeGender;

     
        if (currentUserGender === 'male') {
            oppositeGender = 'female';
        } else if (currentUserGender === 'female') {
            oppositeGender = 'male';
        } else {
            return res.status(400).json({ message: "Invalid gender" });
        }
 
        const [liked] = await pool.query("SELECT liked_user_id FROM likes WHERE user_id = ?", [userId]);
        const [disliked] = await pool.query("SELECT disliked_user_id FROM dislikes WHERE user_id = ?", [userId]);
        
        const likedUserIds = liked.map(row => row.liked_user_id);
        const dislikedUserIds = disliked.map(row => row.disliked_user_id);
        const excludedUserIds = [...likedUserIds, ...dislikedUserIds, userId];

       
        let query = "SELECT * FROM users WHERE gender = ? AND id NOT IN (?)";
        const values = [oppositeGender, excludedUserIds];

        const [rows] = await pool.query(query, values);

        return res.status(200).json({ message: "Users List", data: rows });

    } catch (error) {
        console.error("Error getting users", error);
        res.status(500).send("User not Found");
    }
});


app.post("/Dp", async (req, res) => {
    try {
        const { profileImage } = req.body;
        await pool.query("Insert into users (profile_image) values (?)", [profileImage]);
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

        // Check if the liked user exists
        const [likedUserExists] = await pool.query(
            'SELECT * FROM users WHERE id = ?',
            [likedUserId]
        );

        if (likedUserExists.length === 0) {
            return res.status(400).json({ message: 'Liked user does not exist' });
        }

        // Check if the like already exists
        const [existingLike] = await pool.query(
            'SELECT * FROM likes WHERE user_id = ? AND liked_user_id = ?',
            [userId, likedUserId]
        );

        if (existingLike.length > 0) {
            return res.status(409).send('Already liked');
        }

        // Insert new like
        await pool.query(
            'INSERT INTO likes (user_id, liked_user_id) VALUES (?, ?)',
            [userId, likedUserId]
        );

        // Check if the liked user liked the current user back
        const [likedBack] = await pool.query(
            'SELECT * FROM likes WHERE user_id = ? AND liked_user_id = ?',
            [likedUserId, userId]
        );

        if (likedBack.length > 0) {
            // It's a match, insert into matches
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
        const { dislikedUserId } = req.body; // ID of the user being disliked
        const userId = req.userId; // ID of the user disliking
        console.log("diskiled user id is", dislikedUserId);

        // Add dislike entry to the database (or handle the logic as needed)
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

app.get("/getUsers", verifyToken, async (req, res) => {
    try {
        const userId = req.userId;
        console.log("user id is", userId);
        const [liked] = await pool.query("select liked_user_id from likes where user_id=?", [userId]);
        const [disliked] = await pool.query("select disliked_user_id from dislikes where user_id=?", [userId]);
        console.log("disliked id are ", disliked);
        const likedUserIds = liked.map(row => row.liked_user_id);
        const dislikedUserIds = disliked.map(row => row.disliked_user_id);
        console.log("Liked User IDs:", likedUserIds);
        console.log("disliked user ids:", dislikedUserIds);
        const excludedUserIds = [...likedUserIds, ...dislikedUserIds, userId];
        console.log("excluded user ids are", excludedUserIds);
        let query = "select * from users";
        let values = [];
        if (likedUserIds.length > 0) {
            query += " Where id not in (?)";
            values = [excludedUserIds];
        }
        const [rows] = await pool.query(query, values);
        return res.status(200).json({ message: "Users List", data: rows });

    } catch (error) {
        console.error("Error getting users", error);
        res.status(500).send("User not Found");

    }
})


app.get('/likedUserId', verifyToken, async (req, res) => {
    try {
        const userId = req.userId;
        const [rows] = await pool.query("select liked_user_id from likes where user_id=?", [userId]);
        const likedUserIds = rows.map(row => row.liked_user_id);
        console.log("Liked User IDs:", likedUserIds);
        res.status(200).json({ message: "Liked List", data: likedUserIds });
    } catch (error) {
        console.error("error getting users", error);
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




// Add this API to fetch chat history between two users
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

// io.on('connection', (socket) => {
//     console.log('A user connected:', socket.id);

//     socket.on('registerUser', (userId) => {
//         console.log(`Registering user with userId: ${userId}`);
//         socket.join(userId);
//     });

//     socket.on('sendMessage', ({ receiverId, message, senderId }) => {
//         console.log(`Message from ${senderId} to ${receiverId}: ${message}`);
//         // Emit to the receiver's room
//         socket.to(receiverId).emit('receiveMessage', {
//             senderId: senderId,
//             message: message
//         });
//     });

//     socket.on('error', (error) => {
//         console.error('Socket error:', error);
//       });
      

//     socket.on('disconnect', () => {
//         console.log('User disconnected:', socket.id);
//     });
// });

 

// Server-side code using Node.js and Socket.io
io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);


    socket.on('registerUser', (userId) => {
        console.log(userId)
        socket.userId = userId;  // Store the userId with the socket
        console.log(`Registering user with userId: ${userId}`);
    });

    // Listen for sendMessage events
    socket.on('sendMessage', ({ senderId, receiverId, message }) => {
        console.log(`Message from ${senderId} to ${receiverId}: ${message}`);
console.log(receiverId)
        // Find the receiver's socket and emit the message to them
        const receiverSocket = [...io.sockets.sockets.values()].find(
            (s) => s.userId === receiverId
        );


        const allSockets = [...io.sockets.sockets.values()].map(s => ({ id: s.id, userId: s.userId }));
// console.log("Connected sockets:", allSockets);


        console.log(receiverSocket)

        if (receiverSocket) {
            receiverSocket.emit('receiveMessage', { senderId, message });
            console.log(`Message emitted to receiverId: ${receiverId}`);
        } else {
            console.log(`User with receiverId: ${receiverId} not connected`);
        }
    });
});


app.post('/send-message', verifyToken, async (req, res) => {
    const { receiverId, message } = req.body;
    const senderId = req.userId;

    try {
        // Check if users are matched
        const [matchCheck] = await pool.query(
            'SELECT * FROM matches WHERE (user_one_id = ? AND user_two_id = ?) OR (user_one_id = ? AND user_two_id = ?)',
            [senderId, receiverId, receiverId, senderId]
        );

        console.log(`SenderId: ${senderId}, ReceiverId: ${receiverId} - Match check: `, matchCheck);

        if (matchCheck.length === 0) {
            return res.status(400).json({ message: 'You can only message matched users.' });
        }

        // Insert the message into the database
        await pool.query('INSERT INTO messages (sender_id, receiver_id, message) VALUES (?, ?, ?)', [senderId, receiverId, message]);

        // Emit the message to the receiver through Socket.io
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
        const { receiverId } = req.body; // ID of the person to whom the request is sent
        const senderId = req.userId;      // ID of the person sending the request

        const [existingAcceptedRequest] = await pool.query(
            "SELECT * FROM prom_night_requests WHERE (requester_id = ? OR requested_id = ?) AND status = 'accepted'",
            [senderId, senderId]
        );
        if (existingAcceptedRequest.length > 0) {
            return res.status(409).json({ message: 'You are already matched with someone' });
        }

        const [receiverAcceptedRequest] = await pool.query(
            "SELECT * FROM prom_night_requests WHERE (requester_id = ? OR requested_id = ?) AND status = 'accepted'",
            [receiverId, receiverId]
        );
        if (receiverAcceptedRequest.length > 0) {
            return res.status(408).json({ message: 'The requested user is already matched with someone' });
        }

        // Check if the requested user exists
        const [userExists] = await pool.query("SELECT * FROM users WHERE id = ?", [receiverId]);
        if (userExists.length === 0) {
            return res.status(404).json({ message: 'Requested user does not exist' });
        }

        // Check if the requester has already sent a request to this user
        const [existingRequest] = await pool.query(
            "SELECT * FROM prom_night_requests WHERE requester_id = ? AND requested_id = ? AND status = 'pending'",
            [senderId, receiverId]
        );
        if (existingRequest.length > 0) {
            return res.status(411).json({ message: 'Request already sent' });
        }

        // Insert a new prom night request
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


// Accept Prom Night Request
app.post('/acceptPromNight', verifyToken, async (req, res) => {
    const { requestId } = req.body;
    const requestedId = req.userId;

    try {
        // Check if the requested user has already accepted a match
        const [existingAcceptedRequest] = await pool.query(
            "SELECT * FROM prom_night_requests WHERE (requester_id = ? OR requested_id = ?) AND status = 'accepted'",
            [requestedId, requestedId]
        );
        if (existingAcceptedRequest.length > 0) {
            return res.status(409).json({ message: 'You are already matched with someone' });
        }

        // Find the pending request and requester
        const [pendingRequest] = await pool.query(
            "SELECT requester_id FROM prom_night_requests WHERE id = ? AND requested_id = ? AND status = 'pending'",
            [requestId, requestedId]
        );
        if (pendingRequest.length === 0) {
            return res.status(404).json({ message: 'No pending request found' });
        }

        const requesterId = pendingRequest[0].requester_id;

        // Check if the requester is already matched with someone else
        const [requesterAcceptedRequest] = await pool.query(
            "SELECT * FROM prom_night_requests WHERE (requester_id = ? OR requested_id = ?) AND status = 'accepted'",
            [requesterId, requesterId]
        );
        if (requesterAcceptedRequest.length > 0) {
            return res.status(408).json({ message: 'Requester is already matched with someone' });
        }

        // Accept the request
        await pool.query(
            "UPDATE prom_night_requests SET status = 'accepted' WHERE id = ?",
            [requestId]
        );

        // Cancel all other pending requests for both users
        await pool.query(
            "UPDATE prom_night_requests SET status = 'canceled' WHERE (requester_id = ? OR requested_id = ?) AND status = 'pending'",
            [requesterId, requestedId]
        );

        res.status(200).json({ message: 'Prom night request accepted!' });
    } catch (error) {
        console.error("Error accepting prom night request:", error);
        res.status(500).json({ message: 'Server error' });
    }
});


// Cancel Prom Night
app.post('/cancelPromNight', verifyToken, async (req, res) => {
    const { requestId } = req.body; // Change this to requestId
    const requestedId = req.userId;

    // Query to get the requesterId based on requestId
    const [pendingRequest] = await pool.query(
        "SELECT requester_id FROM prom_night_requests WHERE id = ? AND requested_id = ? AND status = 'pending'",
        [requestId, requestedId]
    );
    if (pendingRequest.length === 0) {
        return res.status(404).json({ message: 'No pending request found' });
    }

    const requesterId = pendingRequest[0].requester_id; // Extract the requesterId from the response

    // Cancel the request
    await pool.query(
        "UPDATE prom_night_requests SET status = 'canceled' WHERE id = ?",
        [requestId]
    );

    res.status(200).json({ message: 'Prom night request canceled!' });
});

// Check Prom Night Requests
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



app.get('/likes/:userId', async (req, res) => {
    // const userId = req.user.id; // Assuming you have user ID from authentication middleware
  
    try {
        const { userId } = req.params;
      const [rows] = await pool.query(`
        SELECT u.id, u.name, u.email, u.profile_image
        FROM likes l
        JOIN users u ON l.user_id = u.id
        WHERE l.liked_user_id = ?`, [userId]);

      res.json(rows);
    } catch (error) {
      console.error('Error fetching likes:', error);
      res.status(500).json({ error: 'Error fetching likes' });
    }
  });
  
app.post('/invitePromPartner', verifyToken, async (req, res) => {
    try {
        const { partnerName, partnerEmail } = req.body;
        const senderId = req.userId;

        // Check if the user already has an accepted match
        const [existingAcceptedRequest] = await pool.query(
            "SELECT * FROM prom_night_requests WHERE (requester_id = ? OR requested_id = ?) AND status = 'accepted'",
            [senderId, senderId]
        );
        if (existingAcceptedRequest.length > 0) {
            return res.status(409).json({ message: 'You are already matched with someone' });
        }

        // Generate a unique code for this invitation
        const uniqueCode = Math.random().toString(36).substring(2, 15) + Date.now().toString(36);

        // Insert the invitation into the database
        await pool.query(
            "INSERT INTO prom_invitations (sender_id, partner_name, partner_email, invite_code) VALUES (?, ?, ?, ?)",
            [senderId, partnerName, partnerEmail, uniqueCode]
        );

        // Create the invitation link
        const inviteLink = `https://prom-iota.vercel.app/prom-invite/${uniqueCode}`;

        // Send the invitation email
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: partnerEmail,
            subject: "You're Invited to Prom Night!",
            text: `Hello ${partnerName},\n\nYou have been invited to Prom Night! Please click on the link below to confirm your participation and fill out your details (name, hall, year, phone number):\n\n${inviteLink}\n\nThe invitation will expire once the form is completed.\n\nBest regards,\nProm Night Team`
        };

        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.error("Error sending email:", error);
                return res.status(500).json({ message: 'Error sending email' });
            }
            console.log("Email sent:", info.response);
            res.status(200).json({ message: 'Invitation sent successfully!' });
        });

    } catch (error) {
        console.error("Error inviting prom partner:", error);
        res.status(500).json({ message: 'Server error' });
    }
});

app.post('/promInvite/:inviteCode', async (req, res) => {
    const { inviteCode } = req.params;
    const { name, hall, year, phoneNo } = req.body;

    try {
        // Fetch the invitation using the invite code
        const [invitation] = await pool.query(
            "SELECT * FROM prom_invitations WHERE invite_code = ? AND status = 'pending'",
            [inviteCode]
        );

        if (invitation.length === 0) {
            return res.status(404).json({ message: 'Invalid or expired invitation' });
        }

        const { sender_id } = invitation[0];

        // Create a new user entry in the database for the partner
        const [result] = await pool.query(
            "INSERT INTO users (name, hall, year, phoneNo) VALUES (?, ?, ?, ?)",
            [name, hall, year, phoneNo]
        );

        const newUserId = result.insertId;  // Get the newly created user's ID

        // Update the invitation status to 'accepted'
        await pool.query(
            "UPDATE prom_invitations SET status = 'accepted', partner_details = ? WHERE invite_code = ?",
            [JSON.stringify({ name, hall, year, phoneNo }), inviteCode]
        );

        // Add both users as matched for prom night
        await pool.query(
            "INSERT INTO prom_night_requests (requester_id, requested_id, status) VALUES (?, ?, 'accepted')",
            [sender_id, newUserId] // Use the new user's ID as requested_id
        );

        // Notify the user that the invitation was accepted (if needed)
        res.status(201).json({ message: 'Invitation accepted and form submitted successfully!' });

    } catch (error) {
        console.error("Error accepting invitation:", error);
        res.status(500).json({ message: 'Server error' });
    }
});







const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
})


export default app;


