const mongoose = require('mongoose')

const aiChatMessageSchema = new mongoose.Schema(
    {
        user: {type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true},
        role: {type: String, enum: ['user', 'assistant', 'error'], required: true},
        text: {type: String, required: true},
        usage: {
            promptTokens: {type: Number, default: null},
            completionTokens: {type: Number, default: null},
        },
    },
    {timestamps: true}
)

aiChatMessageSchema.index({user: 1, createdAt: 1})

module.exports = mongoose.model('AiChatMessage', aiChatMessageSchema)
