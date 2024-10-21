import { useState, useContext ,useEffect} from 'react';
import { useSwipeable } from 'react-swipeable';
import axios from 'axios';
import './Swipe.css';
import { FcLike } from "react-icons/fc";
import { ImCross } from "react-icons/im";
import { GiReturnArrow } from "react-icons/gi";
// import createToast from '../utils/toast';

const Swipe = () => {
    const [ users, setUsers ] = useState([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [loading,setLoading] = useState(false);
    const [animation, setAnimation] = useState(''); // New state to handle animation
    const [error, setError] = useState(null);
    const [swipeText, setSwipeText] = useState('');
    const userData = localStorage.getItem('user');
    const parsedUser = userData ? JSON.parse(userData) : null;
    const token = JSON.parse(localStorage.getItem("token"));
    console.log(token)
const Tab = createBottomTabNavigator();

    useEffect(() => {
        const fetchUsers = async () => {
            setLoading(true); 
            try {
                const response = await axios.get('http://192.168.84.96:3000/getUsers', {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                });
                console.log("response is ",response);
                if (Array.isArray(response.data.data)) {
                    setUsers(response.data.data); 
                } else {
                    console.error('Fetched data is not array', response.data.data);
                    setError('Fetched data is not in the expected format.');
                }
            } catch (error) {
                console.error('Error fetching users', error);
                setError('Error fetching users. Please try again later.');
            } finally {
                setLoading(false);
            }
        };

        fetchUsers();
    }, [token]);


    const likeUser = async (likedUserId) => {
        console.log("liked user id is",likedUserId);
        try {
            const response = await axios.post('http://192.168.84.96:3000/like',{ likedUserId },
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                }
            );
            console.log("response is ",response);
            if (response.data === "It's a match!") {
                alert('It\'s a match!');
            } else {
                alert('User liked successfully!');
            }
            setMatches((prevMatches) => [...prevMatches, likedUserId]);
        } catch (error) {
            console.error('Error liking user', error);
            setError('Error liking user. Please try again later.');
        }
    };

    const dislikeUser = async (dislikedUserId) => {
        try {
            await axios.post(
                'http://localhost:3000/dislike',
                { dislikedUserId },
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                }
            );
            alert('User disliked successfully!');
        } catch (error) {
            console.error('Error disliking user', error);
            setError('Error disliking user. Please try again later.');
        }
    };

    const handleLike = (userId) => {

        setAnimation('swipe-right');
        setSwipeText('Like!');
        setTimeout(() => {
            likeUser(userId);
            nextUser();
            setAnimation('');
            setSwipeText('');
        }, 300);
    };

    const handleDislike = () => {
        setAnimation('swipe-left');
        setSwipeText('Nope');
        setTimeout(() => {
            dislikeUser(users[currentIndex].id);
            nextUser();
            setAnimation('');
            setSwipeText('');
        }, 300);
    };

    const nextUser = () => {
        setCurrentIndex((prevIndex) => (prevIndex + 1) % users.length);
    };

    const handlers = useSwipeable({
        onSwipedLeft: handleDislike,
        onSwipedRight: () => handleLike(users[currentIndex].id),
        preventDefaultTouchmoveEvent: true,
        trackMouse: true,
    });

    if (loading) {
        return <div>Loading...</div>; // Loading state
    }

    if (error) {
        return <div>{error}</div>; // Error state
    }

    if (!users || !Array.isArray(users) || users.length === 0) {
        return <div>No users available</div>; // No users case
    }
    if (loading) {
        return <div>Loading...</div>; // Loading state
    }

    if (error) {
        return <div>{error}</div>; // Error state
    }

    if (!users || !Array.isArray(users) || users.length === 0) {
        return <div>No users available</div>; // No users case
    }

    const currentUser = users[currentIndex];
    console.log(currentUser)

    return (
        <div className={`swipe-container ${animation}`} {...handlers}>
            <div className={`card ${animation}`}>
            <img src={`https://gateway.pinata.cloud/ipfs/${currentUser.profile_image}`} alt={currentUser.name} className="user-image" />

                <div className="user-info">
                    <h3>{currentUser.name}</h3>
                    <p>{currentUser.bio}</p>
                </div>
                <div className="action-buttons">
                    <ImCross onClick={handleDislike} className="dislike-button" />
                    <FcLike onClick={() => handleLike(currentUser.id)} className="like-button" />
                    <GiReturnArrow onClick={() => handleLike(currentUser.id)} className="reverse-button" />
                </div>
            </div>
            {swipeText && <div className={`swipe-text ${animation}`}>{swipeText}</div>}
        </div>
    );
};

export default Swipe;
