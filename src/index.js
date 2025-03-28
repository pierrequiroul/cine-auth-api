const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { supabase } = require('./supabaseClient');
const { Resend } = require('resend');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());
app.use('/uploads/avatars', express.static('uploads/avatars'));

const resend = new Resend(process.env.RESEND_API_KEY);
const upload = multer({ dest: 'uploads/avatars' });

const generateCode = () => Math.floor(100000 + Math.random() * 900000).toString();

// 🔐 Middleware vérification token
const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Token manquant' });

  const userId = authHeader.split(' ')[1];
  if (!userId) return res.status(401).json({ error: 'Token invalide' });

  req.userId = userId;
  next();
};

// 1. Demander un code
app.post('/auth/request-code', async (req, res) => {
  let { email, username } = req.body;
  if (!email || !username) return res.status(400).json({ message: 'Champs manquants' });

  email = email.toLowerCase();
  username = username.toLowerCase();
  const code = generateCode();
  const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 min

  const { error } = await supabase
    .from('users')
    .upsert({ email, username, verification_code: code, code_expires_at: expires });

  if (error) {
    console.error('Erreur Supabase (request-code) :', error.message);
    return res.status(500).json({ message: error.message });
  }

  console.log(`📧 Code pour ${email} : ${code}`);
  await resend.emails.send({
    from: 'noreply@pierrelac.be',
    to: email,
    subject: 'Ton code de connexion CineSocial',
    html: `<p>Ton code est <strong>${code}</strong></p>`,
  });

  return res.status(200).json({ success: true });
});

// 2. Vérifier le code
app.post('/auth/verify-code', async (req, res) => {
  let { email, code } = req.body;
  if (!email || !code) return res.status(400).json({ error: 'Champs manquants' });

  email = email.toLowerCase();

  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('email', email)
    .eq('verification_code', code)
    .gte('code_expires_at', new Date().toISOString())
    .single();

  if (!data || error) return res.status(401).json({ error: 'Code invalide ou expiré' });

  await supabase
    .from('users')
    .update({
      verification_code: null,
      code_expires_at: null,
      last_login_at: new Date(),
    })
    .eq('id', data.id);

  return res.status(200).json({
    token: data.id,
    username: data.username,
    displayName: data.display_name,
    avatarUrl: data.avatar_url,
    isNewUser: !data.last_login_at,
  });
});

// 3. Setup du profil
app.post('/auth/profile-setup', verifyToken, upload.single('avatar'), async (req, res) => {
  const { displayName } = req.body;
  const userId = req.userId;
  const file = req.file;

  const updates = {};

  if (displayName) updates.display_name = displayName;

  if (file) {
    const ext = path.extname(file.originalname);
    const filename = `${userId}_${Date.now()}${ext}`;
    const newPath = path.join('uploads/avatars', filename);
    fs.renameSync(file.path, newPath);
    updates.avatar_url = `/uploads/avatars/${filename}`;
  }

  const { error } = await supabase
    .from('users')
    .update(updates)
    .eq('id', userId);

  if (error) {
    console.error('Erreur profile-setup:', error.message);
    return res.status(500).json({ error: error.message });
  }

  return res.status(200).json({ success: true });
});

app.listen(3001, () => {
  console.log('✅ CineSocial Auth API lancée sur http://localhost:3001');
});
