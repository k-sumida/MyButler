import { useState } from 'react';

import { auth } from '../api';

import './Settings.css';



export default function Settings({ user, setUser }) {

  const [lineUserId, setLineUserId] = useState(user.line_user_id || '');

  const [lineMessage, setLineMessage] = useState('');

  const [lineError, setLineError] = useState('');

  const [lineSaving, setLineSaving] = useState(false);



  const [currentPassword, setCurrentPassword] = useState('');

  const [newPassword, setNewPassword] = useState('');

  const [confirmPassword, setConfirmPassword] = useState('');

  const [pwMessage, setPwMessage] = useState('');

  const [pwError, setPwError] = useState('');

  const [pwSaving, setPwSaving] = useState(false);



  const handleSaveLine = async (e) => {

    e.preventDefault();

    setLineSaving(true);

    setLineError('');

    setLineMessage('');

    try {

      const data = await auth.updateLine(lineUserId);

      setUser({ ...user, line_user_id: data.line_user_id });

      setLineMessage('LINE連携設定を保存しました');

    } catch (err) {

      setLineError(err.message);

    } finally {

      setLineSaving(false);

    }

  };



  const handleChangePassword = async (e) => {

    e.preventDefault();

    setPwError('');

    setPwMessage('');

    if (newPassword !== confirmPassword) {

      setPwError('新しいパスワードが一致しません');

      return;

    }

    setPwSaving(true);

    try {

      await auth.changePassword(currentPassword, newPassword);

      setPwMessage('パスワードを変更しました');

      setCurrentPassword('');

      setNewPassword('');

      setConfirmPassword('');

    } catch (err) {

      setPwError(err.message);

    } finally {

      setPwSaving(false);

    }

  };



  return (

    <div className="settings">

      <div className="page-header">

        <h2>設定</h2>

        <p>アカウント情報とLINE通知の設定</p>

      </div>



      <div className="settings-grid">

        <div className="card settings-section">

          <h3>アカウント情報</h3>

          <div className="info-row">

            <span className="info-label">ユーザーID</span>

            <span className="info-value">{user.username}</span>

          </div>

          <div className="info-row">

            <span className="info-label">登録日</span>

            <span className="info-value">{user.created_at?.split(' ')[0] || '-'}</span>

          </div>

        </div>



        <div className="card settings-section">

          <h3>パスワード変更</h3>

          <form onSubmit={handleChangePassword}>

            <div className="form-group">

              <label>現在のパスワード</label>

              <input

                type="password"

                value={currentPassword}

                onChange={(e) => setCurrentPassword(e.target.value)}

                required

              />

            </div>

            <div className="form-group">

              <label>新しいパスワード（6文字以上）</label>

              <input

                type="password"

                value={newPassword}

                onChange={(e) => setNewPassword(e.target.value)}

                required

                minLength={6}

              />

            </div>

            <div className="form-group">

              <label>新しいパスワード（確認）</label>

              <input

                type="password"

                value={confirmPassword}

                onChange={(e) => setConfirmPassword(e.target.value)}

                required

              />

            </div>

            {pwMessage && <p className="success-msg">{pwMessage}</p>}

            {pwError && <p className="error-msg">{pwError}</p>}

            <button type="submit" className="btn-primary" disabled={pwSaving}>

              {pwSaving ? '変更中...' : 'パスワードを変更'}

            </button>

          </form>

        </div>



        <div className="card settings-section">

          <h3>LINE通知設定</h3>

          <p className="settings-desc">

            メモの通知日にLINEでリマインダーを受け取るには、LINE User IDを設定してください。

          </p>

          <form onSubmit={handleSaveLine}>

            <div className="form-group">

              <label>LINE User ID</label>

              <input

                value={lineUserId}

                onChange={(e) => setLineUserId(e.target.value)}

                placeholder="Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

              />

            </div>

            {lineMessage && <p className="success-msg">{lineMessage}</p>}

            {lineError && <p className="error-msg">{lineError}</p>}

            <button type="submit" className="btn-primary" disabled={lineSaving}>

              {lineSaving ? '保存中...' : '保存'}

            </button>

          </form>



          <div className="line-guide">

            <h4>LINE連携の手順</h4>

            <ol>

              <li><a href="https://developers.line.biz/" target="_blank" rel="noreferrer">LINE Developers</a>でMessaging APIチャネルを作成</li>

              <li>チャネルアクセストークンを <code>services/notification/.env</code> に設定</li>

              <li>LINE公式アカウントを友だち追加</li>

              <li>WebhookまたはログからUser IDを取得し、上記に入力</li>

            </ol>

          </div>

        </div>

      </div>

    </div>

  );

}

