import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { authRouter } from './routes/auth.js';
import { userRouter } from './routes/user.js';
import { ideaRouter } from './routes/idea.js';
import { materialRouter } from './routes/material.js';
import { productRouter } from './routes/product.js';
import { taskRouter } from './routes/task.js';
import { noteRouter } from './routes/note.js';
import { dashboardRouter } from './routes/dashboard.js';
import { notificationRouter } from './routes/notification.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api/auth', authRouter);
app.use('/api/users', userRouter);
app.use('/api/ideas', ideaRouter);
app.use('/api/materials', materialRouter);
app.use('/api/products', productRouter);
app.use('/api/tasks', taskRouter);
app.use('/api/notes', noteRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/notifications', notificationRouter);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
