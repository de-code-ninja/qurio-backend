import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
    name :  String , 
    username: String,
    email : {type: String , required : true , unique : true},
    password: { type: String, required: true },
    profilePic : String ,
    isOnline: { type:Boolean , default: false } , 
    lastSeen: Date ,
    friends: [{
        type: mongoose.Schema.Types.ObjectId ,
        ref:  "User"
    }],
    friendRequests: [{
        type: mongoose.Schema.Types.ObjectId ,
        ref:  "User"
    }],
    unreadMessages: [{
        type: mongoose.Schema.Types.ObjectId ,
        ref:  "Message"
    }],
    bio: String ,
    

} , {timestamps: true})

export default mongoose.model("User" , userSchema)


