import express from "express"
import { loginUser , registerUser , logout } from "../controllers/authController.js"

const router = express.Router()


router.post("/login" , loginUser)
router.post("/register" , registerUser)
router.post("/logout" , logout)

export default router