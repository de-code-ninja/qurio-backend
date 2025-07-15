import mongoose from "mongoose";

const messageSchema = new mongoose.Schema({
    senderID:{ 
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    receiverID:{ 
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    content: String ,
    media: String ,
    messageType: {
        type: String,
        enum: ['text', 'image', 'video', 'file'],
        default: 'text',
    },
    isRead : { type: Boolean , default:false},
    timestamp: {type: Date , default: Date.now} ,
})

export default mongoose.model("Message" , messageSchema)