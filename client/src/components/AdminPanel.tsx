import React, { useState } from 'react';
import axios from 'axios';

interface UploadedFile {
  id: string;
  name: string;
  size: number;
  status: 'uploading' | 'success' | 'error';
  progress: number;
  error?: string;
}

export default function AdminPanel() {
  const [activeTab, setActiveTab] = useState<'upload' | 'rag-query' | 'admin-upload'>('upload');
  const [domain, setDomain] = useState('demo');
  const [files, setFiles] = useState<File[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [token, setToken] = useState('');
  const [status, setStatus] = useState<string>('');
  const [busy, setBusy] = useState(false);

  // RAG Query state
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<string>('');
  const [sources, setSources] = useState<{ score?: number; text: string; metadata?: any }[]>([]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files ? Array.from(e.target.files) : [];
    setFiles(prev => [...prev, ...selectedFiles]);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const droppedFiles = Array.from(e.dataTransfer.files);
    const pdfFiles = droppedFiles.filter(file => file.type === 'application/pdf');
    setFiles(prev => [...prev, ...pdfFiles]);
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const uploadFiles = async (useAdminEndpoint = false) => {
    if (!domain.trim()) {
      setStatus('Please enter a domain name.');
      return;
    }
    if (files.length === 0) {
      setStatus('Please select PDF files to upload.');
      return;
    }

    if (useAdminEndpoint && !token.trim()) {
      setStatus('Admin token is required for admin uploads.');
      return;
    }

    setBusy(true);
    setStatus(`Uploading ${files.length} file(s)...`);
    setUploadedFiles([]);

    const uploadPromises = files.map(async (file, index) => {
      const fileId = `${Date.now()}-${index}-${file.name}`;
      const uploadFile: UploadedFile = {
        id: fileId,
        name: file.name,
        size: file.size,
        status: 'uploading',
        progress: 0
      };

      setUploadedFiles(prev => [...prev, uploadFile]);

      try {
        const fd = new FormData();
        fd.append('domain', domain.trim());
        fd.append('files', file);

        // Simulate progress updates
        const progressInterval = setInterval(() => {
          setUploadedFiles(prev => prev.map(f =>
            f.id === fileId && f.progress < 90
              ? { ...f, progress: f.progress + 10 }
              : f
          ));
        }, 200);

        const endpoint = useAdminEndpoint ? '/api/admin/rag/ingest' : '/api/rag/ingest';
        const headers: any = { 'Content-Type': 'multipart/form-data' };

        if (useAdminEndpoint) {
          headers['x-admin-token'] = token.trim();
        }

        const { data } = await axios.post(endpoint, fd, { headers });

        clearInterval(progressInterval);
        setUploadedFiles(prev => prev.map(f =>
          f.id === fileId
            ? { ...f, status: 'success', progress: 100 }
            : f
        ));

        return { success: true, file: file.name, data };
      } catch (error: any) {
        setUploadedFiles(prev => prev.map(f =>
          f.id === fileId
            ? { ...f, status: 'error', error: error?.response?.data?.error || error?.message || 'Upload failed' }
            : f
        ));
        return { success: false, file: file.name, error };
      }
    });

    try {
      const results = await Promise.allSettled(uploadPromises);
      const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
      const failed = results.length - successful;

      setStatus(`Upload complete: ${successful} successful, ${failed} failed`);
      if (failed === 0) {
        setTimeout(() => setStatus('All files uploaded successfully!'), 2000);
      }
    } catch (error) {
      setStatus('Upload process failed');
    } finally {
      setBusy(false);
    }
  };

  const queryRag = async () => {
    if (!domain.trim() || !question.trim()) return;

    setBusy(true);
    setAnswer('');
    setSources([]);

    try {
      const { data } = await axios.post('/api/rag/query', {
        domain: domain.trim(),
        question: question.trim()
      });
      setAnswer(data.answer || '');
      setSources(data.sources || []);
    } catch (error: any) {
      setAnswer(`Query failed: ${error?.response?.data?.error || error?.message || 'Unknown error'}`);
    } finally {
      setBusy(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div style={{
      maxWidth: '1200px',
      margin: '0 auto',
      padding: '20px',
      fontFamily: 'Arial, sans-serif',
      backgroundColor: '#f5f5f5',
      minHeight: '100vh'
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
        overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{
          backgroundColor: '#2c3e50',
          color: 'white',
          padding: '20px',
          textAlign: 'center'
        }}>
          <h1 style={{ margin: 0, fontSize: '24px' }}>Admin Panel - PDF Management</h1>
          <p style={{ margin: '5px 0 0 0', opacity: 0.8 }}>Upload, manage, and query PDF documents</p>
        </div>

        {/* Tab Navigation */}
        <div style={{
          backgroundColor: '#34495e',
          display: 'flex',
          borderBottom: '1px solid #2c3e50'
        }}>
          {[
            { key: 'upload', label: '📁 File Upload' },
            { key: 'admin-upload', label: '🔐 Admin Upload' },
            { key: 'rag-query', label: '🔍 RAG Query' }
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              style={{
                flex: 1,
                padding: '15px',
                backgroundColor: activeTab === tab.key ? '#3498db' : 'transparent',
                color: 'white',
                border: 'none',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: activeTab === tab.key ? 'bold' : 'normal',
                transition: 'background-color 0.3s'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ padding: '30px' }}>
          {/* Upload Tab */}
          {activeTab === 'upload' && (
            <div>
              <h2 style={{ color: '#2c3e50', marginBottom: '20px' }}>📁 Standard PDF Upload</h2>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
                  Domain:
                </label>
                <input
                  type="text"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  placeholder="e.g., javascript, python, dbms"
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '2px solid #ddd',
                    borderRadius: '4px',
                    fontSize: '16px'
                  }}
                />
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
                  PDF Files:
                </label>
                <div
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  style={{
                    border: '2px dashed #ddd',
                    borderRadius: '4px',
                    padding: '20px',
                    textAlign: 'center',
                    backgroundColor: '#fafafa',
                    cursor: 'pointer'
                  }}
                >
                  <div style={{ marginBottom: '10px' }}>
                    📄 Drag and drop PDF files here, or click to select
                  </div>
                  <input
                    type="file"
                    accept="application/pdf"
                    multiple
                    onChange={handleFileSelect}
                    style={{ display: 'none' }}
                    id="file-upload"
                  />
                  <label
                    htmlFor="file-upload"
                    style={{
                      backgroundColor: '#3498db',
                      color: 'white',
                      padding: '10px 20px',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      display: 'inline-block'
                    }}
                  >
                    Choose Files
                  </label>
                </div>

                {files.length > 0 && (
                  <div style={{ marginTop: '15px' }}>
                    <h4>Selected Files ({files.length}):</h4>
                    <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                      {files.map((file, index) => (
                        <div
                          key={index}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '8px',
                            backgroundColor: '#f8f9fa',
                            marginBottom: '5px',
                            borderRadius: '4px'
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: 'bold' }}>{file.name}</div>
                            <div style={{ fontSize: '12px', color: '#666' }}>
                              {formatFileSize(file.size)}
                            </div>
                          </div>
                          <button
                            onClick={() => removeFile(index)}
                            style={{
                              backgroundColor: '#e74c3c',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              padding: '4px 8px',
                              cursor: 'pointer'
                            }}
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <button
                onClick={() => uploadFiles(false)}
                disabled={busy || files.length === 0}
                style={{
                  backgroundColor: busy ? '#95a5a6' : '#27ae60',
                  color: 'white',
                  border: 'none',
                  padding: '12px 30px',
                  borderRadius: '4px',
                  fontSize: '16px',
                  cursor: busy ? 'not-allowed' : 'pointer',
                  width: '100%'
                }}
              >
                {busy ? '⏳ Uploading...' : `📤 Upload ${files.length} File(s)`}
              </button>

              {status && (
                <div
                  style={{
                    marginTop: '15px',
                    padding: '10px',
                    borderRadius: '4px',
                    backgroundColor: status.includes('Failed') || status.includes('failed') ? '#f8d7da' : '#d4edda',
                    color: status.includes('Failed') || status.includes('failed') ? '#721c24' : '#155724',
                    border: `1px solid ${status.includes('Failed') || status.includes('failed') ? '#f5c6cb' : '#c3e6cb'}`
                  }}
                >
                  {status}
                </div>
              )}

              {/* Upload Progress */}
              {uploadedFiles.length > 0 && (
                <div style={{ marginTop: '20px' }}>
                  <h4>Upload Progress:</h4>
                  {uploadedFiles.map(file => (
                    <div key={file.id} style={{ marginBottom: '10px' }}>
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '5px'
                      }}>
                        <span style={{ fontSize: '14px' }}>{file.name}</span>
                        <span style={{
                          fontSize: '12px',
                          color: file.status === 'error' ? '#e74c3c' : file.status === 'success' ? '#27ae60' : '#3498db'
                        }}>
                          {file.status === 'error' ? '❌ Error' : file.status === 'success' ? '✅ Complete' : `⏳ ${file.progress}%`}
                        </span>
                      </div>
                      <div style={{
                        width: '100%',
                        height: '8px',
                        backgroundColor: '#eee',
                        borderRadius: '4px',
                        overflow: 'hidden'
                      }}>
                        <div style={{
                          width: `${file.progress}%`,
                          height: '100%',
                          backgroundColor: file.status === 'error' ? '#e74c3c' : file.status === 'success' ? '#27ae60' : '#3498db',
                          transition: 'width 0.3s'
                        }} />
                      </div>
                      {file.error && (
                        <div style={{ fontSize: '12px', color: '#e74c3c', marginTop: '2px' }}>
                          {file.error}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Admin Upload Tab */}
          {activeTab === 'admin-upload' && (
            <div>
              <h2 style={{ color: '#2c3e50', marginBottom: '20px' }}>🔐 Admin PDF Upload</h2>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
                  Admin Token:
                </label>
                <input
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="Enter admin token"
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '2px solid #ddd',
                    borderRadius: '4px',
                    fontSize: '16px'
                  }}
                />
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
                  Domain:
                </label>
                <input
                  type="text"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  placeholder="e.g., javascript, python, dbms"
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '2px solid #ddd',
                    borderRadius: '4px',
                    fontSize: '16px'
                  }}
                />
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
                  PDF Files:
                </label>
                <div
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  style={{
                    border: '2px dashed #ddd',
                    borderRadius: '4px',
                    padding: '20px',
                    textAlign: 'center',
                    backgroundColor: '#fafafa',
                    cursor: 'pointer'
                  }}
                >
                  <div style={{ marginBottom: '10px' }}>
                    📄 Drag and drop PDF files here, or click to select
                  </div>
                  <input
                    type="file"
                    accept="application/pdf"
                    multiple
                    onChange={handleFileSelect}
                    style={{ display: 'none' }}
                    id="admin-file-upload"
                  />
                  <label
                    htmlFor="admin-file-upload"
                    style={{
                      backgroundColor: '#e74c3c',
                      color: 'white',
                      padding: '10px 20px',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      display: 'inline-block'
                    }}
                  >
                    Choose Files
                  </label>
                </div>

                {files.length > 0 && (
                  <div style={{ marginTop: '15px' }}>
                    <h4>Selected Files ({files.length}):</h4>
                    <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                      {files.map((file, index) => (
                        <div
                          key={index}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '8px',
                            backgroundColor: '#f8f9fa',
                            marginBottom: '5px',
                            borderRadius: '4px'
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: 'bold' }}>{file.name}</div>
                            <div style={{ fontSize: '12px', color: '#666' }}>
                              {formatFileSize(file.size)}
                            </div>
                          </div>
                          <button
                            onClick={() => removeFile(index)}
                            style={{
                              backgroundColor: '#e74c3c',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              padding: '4px 8px',
                              cursor: 'pointer'
                            }}
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <button
                onClick={() => uploadFiles(true)}
                disabled={busy || files.length === 0 || !token.trim()}
                style={{
                  backgroundColor: busy ? '#95a5a6' : '#e74c3c',
                  color: 'white',
                  border: 'none',
                  padding: '12px 30px',
                  borderRadius: '4px',
                  fontSize: '16px',
                  cursor: busy || !token.trim() ? 'not-allowed' : 'pointer',
                  width: '100%'
                }}
              >
                {busy ? '⏳ Uploading...' : `🔐 Admin Upload ${files.length} File(s)`}
              </button>

              {status && (
                <div
                  style={{
                    marginTop: '15px',
                    padding: '10px',
                    borderRadius: '4px',
                    backgroundColor: status.includes('Failed') || status.includes('failed') ? '#f8d7da' : '#d4edda',
                    color: status.includes('Failed') || status.includes('failed') ? '#721c24' : '#155724',
                    border: `1px solid ${status.includes('Failed') || status.includes('failed') ? '#f5c6cb' : '#c3e6cb'}`
                  }}
                >
                  {status}
                </div>
              )}
            </div>
          )}

          {/* RAG Query Tab */}
          {activeTab === 'rag-query' && (
            <div>
              <h2 style={{ color: '#2c3e50', marginBottom: '20px' }}>🔍 RAG Query Interface</h2>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
                  Domain:
                </label>
                <input
                  type="text"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  placeholder="Domain to query"
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '2px solid #ddd',
                    borderRadius: '4px',
                    fontSize: '16px'
                  }}
                />
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
                  Question:
                </label>
                <textarea
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="Ask a question about the uploaded PDFs"
                  rows={4}
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '2px solid #ddd',
                    borderRadius: '4px',
                    fontSize: '16px',
                    resize: 'vertical'
                  }}
                />
              </div>

              <button
                onClick={queryRag}
                disabled={busy || !domain.trim() || !question.trim()}
                style={{
                  backgroundColor: busy ? '#95a5a6' : '#9b59b6',
                  color: 'white',
                  border: 'none',
                  padding: '12px 30px',
                  borderRadius: '4px',
                  fontSize: '16px',
                  cursor: busy ? 'not-allowed' : 'pointer'
                }}
              >
                {busy ? '⏳ Querying...' : '🔍 Query RAG'}
              </button>

              {answer && (
                <div style={{ marginTop: '20px' }}>
                  <h3>Answer:</h3>
                  <div style={{
                    padding: '15px',
                    backgroundColor: '#f8f9fa',
                    borderRadius: '4px',
                    borderLeft: '4px solid #9b59b6',
                    whiteSpace: 'pre-wrap'
                  }}>
                    {answer}
                  </div>
                </div>
              )}

              {sources.length > 0 && (
                <div style={{ marginTop: '20px' }}>
                  <h3>Sources:</h3>
                  <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                    {sources.map((source, index) => (
                      <div
                        key={index}
                        style={{
                          marginBottom: '15px',
                          padding: '10px',
                          backgroundColor: '#fff',
                          border: '1px solid #ddd',
                          borderRadius: '4px'
                        }}
                      >
                        <div style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          marginBottom: '8px'
                        }}>
                          <strong>Source {index + 1}</strong>
                          <span style={{ color: '#666' }}>
                            Score: {typeof source.score === 'number' ? source.score.toFixed(3) : 'N/A'}
                          </span>
                        </div>
                        <div style={{ fontSize: '14px', color: '#555' }}>
                          {source.text.length > 400
                            ? `${source.text.substring(0, 400)}...`
                            : source.text
                          }
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
