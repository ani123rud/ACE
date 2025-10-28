import React, { useEffect, useState } from 'react';
import axios from 'axios';

interface Course {
  id: string;
  title: string;
  slug: string;
  domain: string;
  description: string;
  tags: string[];
  difficulty?: string;
  duration?: string;
}

interface Topic {
  id: string;
  courseId: string;
  title: string;
  slug: string;
  content: string;
  order: number;
}

interface QuizQuestion {
  id: string;
  topicId: string;
  question: string;
  options: string[];
  answerIndex: number;
  explanation?: string;
}

export default function LearningAdmin() {
  const [active, setActive] = useState<'courses' | 'topics' | 'quizzes'>('courses');
  const [status, setStatus] = useState<string>('');
  const [token, setToken] = useState<string>('');

  // Courses state
  const [courses, setCourses] = useState<Course[]>([]);
  const [editingCourse, setEditingCourse] = useState<Partial<Course> | null>(null);

  // Topics state
  const [selectedCourseId, setSelectedCourseId] = useState<string>('');
  const [topics, setTopics] = useState<Topic[]>([]);
  const [editingTopic, setEditingTopic] = useState<Partial<Topic> | null>(null);

  // Quizzes state
  const [selectedTopicId, setSelectedTopicId] = useState<string>('');
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [editingQuestion, setEditingQuestion] = useState<Partial<QuizQuestion> | null>(null);

  useEffect(() => {
    // Load saved token and set axios default header
    const saved = localStorage.getItem('adminToken');
    if (saved) {
      setToken(saved);
      try { (axios as any).defaults.headers = (axios as any).defaults.headers || {}; } catch {}
      try { (axios as any).defaults.headers.common = (axios as any).defaults.headers.common || {}; } catch {}
      (axios as any).defaults.headers.common['x-admin-token'] = saved;
    }
  }, []);

  useEffect(() => {
    if (active === 'courses') loadCourses();
  }, [active]);

  const authorize = async () => {
    try {
      // Persist and set default header
      localStorage.setItem('adminToken', token);
      (axios as any).defaults.headers = (axios as any).defaults.headers || {};
      (axios as any).defaults.headers.common = (axios as any).defaults.headers.common || {};
      (axios as any).defaults.headers.common['x-admin-token'] = token;
      // Test call
      await axios.get('/api/admin/learning/courses', { headers: { 'x-admin-token': token } });
      setStatus('Authorized');
      await loadCourses();
    } catch (e:any) {
      setStatus(e?.response?.status === 401 ? 'Unauthorized (check token)' : (e?.response?.data?.error || 'Authorization failed'));
    }
  };

  const loadCourses = async () => {
    try {
      const { data } = await axios.get('/api/admin/learning/courses', { headers: { 'x-admin-token': token } });
      const norm = Array.isArray(data) ? data.map((c:any) => ({ id: c.id || c._id, ...c })) : [];
      setCourses(norm);
    } catch (e:any) {
      setStatus(e?.response?.data?.error || 'Failed to load courses');
    }
  };

  const saveCourse = async () => {
    if (!editingCourse) return;
    try {
      if (editingCourse.id) {
        const { data } = await axios.put(`/api/admin/learning/courses/${editingCourse.id}`, editingCourse, { headers: { 'x-admin-token': token } });
        setCourses(prev => prev.map(c => c.id === data.id ? data : c));
      } else {
        const { data } = await axios.post('/api/admin/learning/courses', editingCourse, { headers: { 'x-admin-token': token } });
        setCourses(prev => [data, ...prev]);
        if (data?.id) { setSelectedCourseId(data.id); loadTopics(data.id); setActive('topics'); }
      }
      setEditingCourse(null);
      setStatus('Saved course');
    } catch (e:any) {
      setStatus(e?.response?.data?.error || 'Failed to save course');
    }
  };

  const deleteCourse = async (id: string) => {
    if (!confirm('Delete this course?')) return;
    try {
      await axios.delete(`/api/admin/learning/courses/${id}`, { headers: { 'x-admin-token': token } });
      setCourses(prev => prev.filter(c => c.id !== id));
    } catch (e:any) {
      setStatus(e?.response?.data?.error || 'Failed to delete course');
    }
  };

  const loadTopics = async (courseId: string) => {
    const isOid = /^[a-f\d]{24}$/i.test(String(courseId || ''));
    if (!isOid) { setTopics([]); return; }
    try {
      const { data } = await axios.get(`/api/admin/learning/courses/${courseId}/topics`, { headers: { 'x-admin-token': token } });
      setTopics(data);
    } catch (e:any) {
      setStatus(e?.response?.data?.error || 'Failed to load topics');
    }
  };

  const saveTopic = async () => {
    if (!editingTopic || !selectedCourseId) return;
    try {
      if (editingTopic.id) {
        const { data } = await axios.put(`/api/admin/learning/topics/${editingTopic.id}`, editingTopic, { headers: { 'x-admin-token': token } });
        setTopics(prev => prev.map(t => t.id === data.id ? data : t));
      } else {
        const { data } = await axios.post(`/api/admin/learning/courses/${selectedCourseId}/topics`, editingTopic, { headers: { 'x-admin-token': token } });
        setTopics(prev => [data, ...prev]);
      }
      setEditingTopic(null);
      setStatus('Saved topic');
    } catch (e:any) {
      setStatus(e?.response?.data?.error || 'Failed to save topic');
    }
  };

  const deleteTopic = async (id: string) => {
    if (!confirm('Delete this topic?')) return;
    try {
      await axios.delete(`/api/admin/learning/topics/${id}`, { headers: { 'x-admin-token': token } });
      setTopics(prev => prev.filter(t => t.id !== id));
    } catch (e:any) {
      setStatus(e?.response?.data?.error || 'Failed to delete topic');
    }
  };

  const loadQuestions = async (topicId: string) => {
    try {
      const { data } = await axios.get(`/api/admin/learning/topics/${topicId}/quizzes`, { headers: { 'x-admin-token': token } });
      setQuestions(data);
    } catch (e:any) {
      setStatus(e?.response?.data?.error || 'Failed to load quizzes');
    }
  };

  const saveQuestion = async () => {
    if (!editingQuestion || !selectedTopicId) return;
    try {
      if (editingQuestion.id) {
        const { data } = await axios.put(`/api/admin/learning/quizzes/${editingQuestion.id}`, editingQuestion, { headers: { 'x-admin-token': token } });
        setQuestions(prev => prev.map(q => q.id === data.id ? data : q));
      } else {
        const { data } = await axios.post(`/api/admin/learning/topics/${selectedTopicId}/quizzes`, editingQuestion, { headers: { 'x-admin-token': token } });
        setQuestions(prev => [data, ...prev]);
      }
      setEditingQuestion(null);
      setStatus('Saved question');
    } catch (e:any) {
      setStatus(e?.response?.data?.error || 'Failed to save question');
    }
  };

  const deleteQuestion = async (id: string) => {
    if (!confirm('Delete this question?')) return;
    try {
      await axios.delete(`/api/admin/learning/quizzes/${id}`, { headers: { 'x-admin-token': token } });
      setQuestions(prev => prev.filter(q => q.id !== id));
    } catch (e:any) {
      setStatus(e?.response?.data?.error || 'Failed to delete question');
    }
  };

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div style={{ display:'flex', gap:8, alignItems:'center' }}>
        <label style={{ minWidth: 100 }}>Admin Token</label>
        <input type="password" placeholder="Enter admin token" value={token} onChange={e=>setToken(e.target.value)} />
        <button onClick={authorize}>Authorize</button>
        <button onClick={() => { localStorage.removeItem('adminToken'); setToken(''); try { delete (axios as any).defaults.headers.common['x-admin-token']; } catch {}; setStatus('Cleared admin token'); }}>Clear</button>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => setActive('courses')}>Courses</button>
        <button onClick={() => setActive('topics')}>Topics</button>
        <button onClick={() => setActive('quizzes')}>Quizzes</button>
        <button onClick={loadCourses}>Refresh</button>
      </div>
      {status && <div style={{ background:'#eef', padding: 8 }}>{status}</div>}

      {active === 'courses' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <h3>Courses</h3>
            <button onClick={() => setEditingCourse({ title: '', slug: '', domain: '', description: '', tags: [] })}>+ New Course</button>
            <ul>
              {courses.map(c => (
                <li key={c.id} style={{ display:'flex', justifyContent:'space-between', padding:'6px 0' }}>
                  <span>{c.title} — {c.domain}</span>
                  <span>
                    <button onClick={() => setEditingCourse(c)}>Edit</button>
                    <button onClick={() => deleteCourse(c.id)}>Delete</button>
                    <button onClick={() => { setSelectedCourseId(c.id); setActive('topics'); loadTopics(c.id); }}>Topics</button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            {editingCourse && (
              <div>
                <h3>{editingCourse.id ? 'Edit Course' : 'New Course'}</h3>
                <div style={{ display:'grid', gap:8 }}>
                  <input placeholder="Title" value={editingCourse.title||''} onChange={e=>setEditingCourse({ ...editingCourse, title:e.target.value })} />
                  <input placeholder="Slug" value={editingCourse.slug||''} onChange={e=>setEditingCourse({ ...editingCourse, slug:e.target.value })} />
                  <input placeholder="Domain" value={editingCourse.domain||''} onChange={e=>setEditingCourse({ ...editingCourse, domain:e.target.value })} />
                  <textarea placeholder="Description" value={editingCourse.description||''} onChange={e=>setEditingCourse({ ...editingCourse, description:e.target.value })} />
                  <input placeholder="Tags (comma)" value={(editingCourse.tags||[]).join(',')} onChange={e=>setEditingCourse({ ...editingCourse, tags:e.target.value.split(',').map(s=>s.trim()).filter(Boolean) })} />
                  <div style={{ display:'flex', gap:8 }}>
                    <button onClick={saveCourse}>Save</button>
                    <button onClick={()=>setEditingCourse(null)}>Cancel</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {active === 'topics' && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
          <div>
            <h3>Topics for Course</h3>
            <select value={selectedCourseId} onChange={e=>{ const v=e.target.value; setSelectedCourseId(v); if(v) loadTopics(v); }}>
              <option value="">Select course</option>
              {courses.map(c => <option key={c.id} value={c.id}>{c.title} ({String(c.id).slice(0,6)})</option>)}
            </select>
            <button disabled={!selectedCourseId} onClick={()=> setEditingTopic({ courseId:selectedCourseId, title:'', slug:'', content:'', order:0 })}>+ New Topic</button>
            <ul>
              {topics.map(t => (
                <li key={t.id} style={{ display:'flex', justifyContent:'space-between', padding:'6px 0' }}>
                  <span>{t.order}. {t.title}</span>
                  <span>
                    <button onClick={() => { setEditingTopic(t); }}>Edit</button>
                    <button onClick={() => deleteTopic(t.id)}>Delete</button>
                    <button onClick={() => { setSelectedTopicId(t.id); setActive('quizzes'); loadQuestions(t.id); }}>Quizzes</button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            {editingTopic && (
              <div>
                <h3>{editingTopic.id ? 'Edit Topic' : 'New Topic'}</h3>
                <div style={{ display:'grid', gap:8 }}>
                  <input placeholder="Title" value={editingTopic.title||''} onChange={e=>setEditingTopic({ ...editingTopic, title:e.target.value })} />
                  <input placeholder="Slug" value={editingTopic.slug||''} onChange={e=>setEditingTopic({ ...editingTopic, slug:e.target.value })} />
                  <input placeholder="Order" type="number" value={editingTopic.order||0} onChange={e=>setEditingTopic({ ...editingTopic, order:Number(e.target.value)||0 })} />
                  <textarea placeholder="Content (markdown or HTML)" rows={10} value={editingTopic.content||''} onChange={e=>setEditingTopic({ ...editingTopic, content:e.target.value })} />
                  <div style={{ display:'flex', gap:8 }}>
                    <button onClick={saveTopic}>Save</button>
                    <button onClick={()=>setEditingTopic(null)}>Cancel</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {active === 'quizzes' && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
          <div>
            <h3>Quizzes for Topic</h3>
            <select value={selectedTopicId} onChange={e=>{ setSelectedTopicId(e.target.value); if(e.target.value) loadQuestions(e.target.value); }}>
              <option value="">Select topic</option>
              {topics.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
            </select>
            <button disabled={!selectedTopicId} onClick={()=> setEditingQuestion({ topicId:selectedTopicId, question:'', options:['','', '', ''], answerIndex:0 })}>+ New Question</button>
            <ul>
              {questions.map(q => (
                <li key={q.id} style={{ display:'flex', justifyContent:'space-between', padding:'6px 0' }}>
                  <span>{q.question.slice(0,60)}{q.question.length>60?'…':''}</span>
                  <span>
                    <button onClick={() => setEditingQuestion(q)}>Edit</button>
                    <button onClick={() => deleteQuestion(q.id)}>Delete</button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            {editingQuestion && (
              <div>
                <h3>{editingQuestion.id ? 'Edit Question' : 'New Question'}</h3>
                <div style={{ display:'grid', gap:8 }}>
                  <textarea placeholder="Question" rows={4} value={editingQuestion.question||''} onChange={e=>setEditingQuestion({ ...editingQuestion, question:e.target.value })} />
                  <div style={{ display:'grid', gap:6 }}>
                    {(editingQuestion.options||[]).map((opt, i) => (
                      <input key={i} placeholder={`Option ${i+1}`} value={opt} onChange={e=>{
                        const next = [...(editingQuestion.options||[])];
                        next[i] = e.target.value; setEditingQuestion({ ...editingQuestion, options: next });
                      }} />
                    ))}
                  </div>
                  <input type="number" min={0} max={(editingQuestion.options||[]).length-1} value={editingQuestion.answerIndex||0} onChange={e=>setEditingQuestion({ ...editingQuestion, answerIndex: Number(e.target.value)||0 })} />
                  <textarea placeholder="Explanation (optional)" rows={4} value={editingQuestion.explanation||''} onChange={e=>setEditingQuestion({ ...editingQuestion, explanation:e.target.value })} />
                  <div style={{ display:'flex', gap:8 }}>
                    <button onClick={saveQuestion}>Save</button>
                    <button onClick={()=>setEditingQuestion(null)}>Cancel</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
