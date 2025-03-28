const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { supabase } = require('./supabaseClient');

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

const generateCode = () => Math.floor(100000 + Math.random() * 900000).toString();

app.post('/auth/request-code', async (req: { body: { email: any; username: any; }; }, res: { status: (arg0: number) => { (): any; new(): any; json: { (arg0: { error?: any; success?: boolean; }): any; new(): any; }; }; }) => {
  const { email, username } = req.body;
  if (!email || !username) return res.status(400).json({ error: 'Champs manquants' });

  const code = generateCode();
  const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  const { error } = await supabase
    .from('users')
    .upsert({ email, username, verification_code: code, code_expires_at: expires });

  if (error) return res.status(500).json({ error: error.message });

  console.log(`📧 Code pour ${email} : ${code}`);
  return res.status(200).json({ success: true });
});

app.post('/auth/verify-code', async (req: { body: { email: any; code: any; }; }, res: { status: (arg0: number) => { (): any; new(): any; json: { (arg0: { error?: string; token?: any; username?: any; }): any; new(): any; }; }; }) => {
  const { email, code } = req.body;
  if (!email || !code) return res.status(400).json({ error: 'Champs manquants' });

  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('email', email)
    .eq('verification_code', code)
    .gte('code_expires_at', new Date().toISOString())
    .single();

  if (!data || error) {
    return res.status(401).json({ error: 'Code invalide ou expiré' });
  }

  await supabase
    .from('users')
    .update({
      verification_code: null,
      code_expires_at: null,
      last_login_at: new Date(),
    })
    .eq('id', data.id);

  return res.status(200).json({ token: data.id, username: data.username });
});

app.listen(3001, () => {
  console.log('✅ CineSocial Auth API lancée sur http://localhost:3001');
});
