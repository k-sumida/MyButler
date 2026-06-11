import { useState, useEffect } from 'react';

import { memos as memosApi } from '../api';

import CalendarPopover from '../components/CalendarPopover';

import './Dashboard.css';



const TABS = [

  { key: 'shopping', label: '買い物', icon: '🛒' },

  { key: 'todo', label: 'やること', icon: '✅' },

];



const EMPTY_FORM = {

  title: '',

  content: '',

  due_date: '',

  due_time: '09:00',

  deadline_date: '',

};



export default function Dashboard() {

  const [activeTab, setActiveTab] = useState('shopping');

  const [memoList, setMemoList] = useState([]);

  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);

  const [form, setForm] = useState(EMPTY_FORM);

  const [error, setError] = useState('');



  const isShopping = activeTab === 'shopping';



  const loadMemos = async () => {

    try {

      const data = await memosApi.list({ type: activeTab });

      setMemoList(data.memos);

    } catch (err) {

      setError(err.message);

    } finally {

      setLoading(false);

    }

  };



  useEffect(() => {

    setLoading(true);

    setShowForm(false);

    setForm(EMPTY_FORM);

    loadMemos();

  }, [activeTab]);



  const handleCreate = async (e) => {

    e.preventDefault();

    setError('');

    try {

      const payload = { ...form, type: activeTab };

      if (isShopping) delete payload.deadline_date;

      await memosApi.create(payload);

      setForm(EMPTY_FORM);

      setShowForm(false);

      loadMemos();

    } catch (err) {

      setError(err.message);

    }

  };



  const toggleComplete = async (memo) => {

    await memosApi.update(memo.id, { completed: !memo.completed });

    loadMemos();

  };



  const handleDelete = async (id) => {

    if (!confirm('このメモを削除しますか？')) return;

    await memosApi.delete(id);

    loadMemos();

  };



  const today = new Date().toISOString().split('T')[0];



  return (

    <div className="dashboard">

      <div className="page-header">

        <h2>メモ管理</h2>

        <p>買い物リストややることを日時指定でメモし、LINEで通知を受け取れます</p>

      </div>



      <div className="tab-bar">

        {TABS.map((tab) => (

          <button

            key={tab.key}

            className={`tab-btn ${activeTab === tab.key ? 'active' : ''}`}

            onClick={() => setActiveTab(tab.key)}

          >

            <span>{tab.icon}</span> {tab.label}

          </button>

        ))}

        <button className="btn-primary add-btn" onClick={() => setShowForm(!showForm)}>

          {showForm ? '閉じる' : '+ 新規メモ'}

        </button>

      </div>



      {showForm && (

        <form className="memo-form card" onSubmit={handleCreate}>

          <div className="form-group">

            <label>{isShopping ? '買うもの' : 'やること'}</label>

            <input

              value={form.title}

              onChange={(e) => setForm({ ...form, title: e.target.value })}

              placeholder={isShopping ? '例: 牛乳、パン' : '例: レポート提出'}

              required

            />

          </div>



          {!isShopping && (

            <div className="form-group">

              <label>期日（任意）</label>

              <CalendarPopover

                date={form.deadline_date}

                minDate={today}

                placeholder="期日を選択（任意）"

                allowClear

                onDateChange={(deadline_date) => setForm({ ...form, deadline_date })}

                onClear={() => setForm({ ...form, deadline_date: '' })}

              />

            </div>

          )}



          <div className="form-group">

            <label>詳細（任意）</label>

            <textarea

              value={form.content}

              onChange={(e) => setForm({ ...form, content: e.target.value })}

              rows={2}

              placeholder="補足メモ..."

            />

          </div>



          <div className="form-group">

            <label>LINE通知日時</label>

            <CalendarPopover

              date={form.due_date}

              time={form.due_time}

              minDate={today}

              showTime

              placeholder="通知日時を選択"

              onDateChange={(due_date) => setForm({ ...form, due_date })}

              onTimeChange={(due_time) => setForm({ ...form, due_time })}

            />

          </div>



          {error && <p className="error-msg">{error}</p>}

          <button type="submit" className="btn-primary" disabled={!form.due_date}>保存</button>

        </form>

      )}



      {loading ? (

        <p className="loading-text">読み込み中...</p>

      ) : memoList.length === 0 ? (

        <div className="empty-state card">

          <span style={{ fontSize: 48 }}>{isShopping ? '🛒' : '✅'}</span>

          <p>メモがありません。新しいメモを追加しましょう。</p>

        </div>

      ) : (

        <div className="memo-list">

          {memoList.map((memo) => (

            <div key={memo.id} className={`memo-card card ${memo.completed ? 'completed' : ''}`}>

              <div className="memo-top">

                <span className={`badge badge-${memo.type}`}>

                  {memo.type === 'shopping' ? '買い物' : 'やること'}

                </span>

                <span className="memo-date">🔔 {memo.due_date} {memo.due_time || '09:00'}</span>

              </div>

              <h3 className="memo-title">{memo.title}</h3>

              {memo.deadline_date && (

                <p className="memo-deadline">⏰ 期日: {memo.deadline_date}</p>

              )}

              {memo.content && <p className="memo-content">{memo.content}</p>}

              <div className="memo-actions">

                <button className="btn-secondary" onClick={() => toggleComplete(memo)}>

                  {memo.completed ? '未完了に戻す' : '完了'}

                </button>

                <button className="btn-danger" onClick={() => handleDelete(memo.id)}>削除</button>

              </div>

            </div>

          ))}

        </div>

      )}

    </div>

  );

}

