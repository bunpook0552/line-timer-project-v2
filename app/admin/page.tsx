'use client';

import { useState, useEffect } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
// === FIX #3: นำเข้า deleteDoc ===
import { getFirestore, collection, getDocs, doc, updateDoc, query, where, addDoc, deleteDoc } from 'firebase/firestore';

// === กำหนดค่า Firebase (ใช้ของโปรเจกต์คุณ) ===
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// Initialize Firebase if not already initialized
let firebaseApp;
if (!getApps().length) {
  firebaseApp = initializeApp(firebaseConfig);
} else {
  firebaseApp = getApp(); // if already initialized, use that one
}

const db = getFirestore(firebaseApp);

// === รหัสผ่านสำหรับเข้าหน้า Admin ===
const ADMIN_PASSWORD = 'admin123'; // <--- คุณสามารถเปลี่ยนรหัสผ่านได้ที่นี่

interface MachineConfig {
  id: string; // Document ID from Firestore
  machine_id: number;
  machine_type: 'washer' | 'dryer';
  duration_minutes: number;
  is_active: boolean;
  display_name: string;
}

interface ActiveTimer {
  id: string; // Document ID from Firestore (timers collection)
  user_id: string;
  machine_id: number;
  machine_type: 'washer' | 'dryer';
  display_name: string;
  duration_minutes: number;
  end_time: { seconds: number; nanoseconds: number; }; // Firestore Timestamp
  status: string;
}

interface MessageTemplate {
  docId: string; // Document ID in Firestore
  id: string; // Custom ID from database (e.g., 'initial_greeting')
  text: string;
}

export default function AdminPage() {
  const [password, setPassword] = useState('');
  const [loggedIn, setLoggedIn] = useState(false);
  const [error, setError] = useState('');
  const [machines, setMachines] = useState<MachineConfig[]>([]);
  const [activeTimers, setActiveTimers] = useState<ActiveTimer[]>([]);
  const [messageTemplates, setMessageTemplates] = useState<MessageTemplate[]>([]);
  const [loadingMachines, setLoadingMachines] = useState(true);
  const [loadingTimers, setLoadingTimers] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [editingMachineId, setEditingMachineId] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editMachineFormData, setEditMachineFormData] = useState({ duration_minutes: 0, is_active: false });
  const [editMessageFormData, setEditMessageFormData] = useState('');
  const [addingNewMachine, setAddingNewMachine] = useState(false);
  const [newMachineFormData, setNewMachineFormData] = useState({
    machine_id: '',
    machine_type: 'washer' as 'washer' | 'dryer',
    duration_minutes: '',
    is_active: true,
    display_name: ''
  });

  const STORE_ID = 'laundry_1'; // <--- กำหนด ID ร้านค้าของคุณที่นี่ (ใช้สำหรับร้านแรก)

  useEffect(() => {
    if (loggedIn) {
      fetchMachineConfigs();
      fetchActiveTimers();
      fetchMessageTemplates();
    }
  }, [loggedIn]);

  const fetchMachineConfigs = async () => {
    setLoadingMachines(true);
    try {
      const machineConfigsCol = collection(db, 'stores', STORE_ID, 'machine_configs');
      const machineSnapshot = await getDocs(machineConfigsCol);
      const machineList = machineSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as MachineConfig[];
      machineList.sort((a, b) => {
        if (a.machine_type === b.machine_type) {
          return a.machine_id - b.machine_id;
        }
        return a.machine_type.localeCompare(b.machine_type);
      });
      setMachines(machineList);
    } catch (err) {
      console.error("Error fetching machine configs:", err);
      setError("ไม่สามารถดึงข้อมูลการตั้งค่าเครื่องได้");
    } finally {
      setLoadingMachines(false);
    }
  };

  const fetchActiveTimers = async () => {
    setLoadingTimers(true);
    try {
      const timersCol = collection(db, 'stores', STORE_ID, 'timers');
      const q = query(timersCol, where('status', '==', 'pending'));
      const activeTimersSnapshot = await getDocs(q);

      const timerList = activeTimersSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as ActiveTimer[];

      timerList.sort((a, b) => {
        const dateA = new Date(a.end_time.seconds * 1000 + a.end_time.nanoseconds / 1000000);
        const dateB = new Date(b.end_time.seconds * 1000 + b.end_time.nanoseconds / 1000000);
        return dateA.getTime() - dateB.getTime();
      });

      setActiveTimers(timerList);
    } catch (err: unknown) {
      console.error("Error fetching active timers:", err);
      if (typeof err === 'object' && err !== null && 'code' in err && 'details' in err) {
        const firebaseError = err as { code: string, details: string };
        if (firebaseError.code === 'failed-precondition' && firebaseError.details.includes('requires an index')) {
          setError("Firebase Index สำหรับรายการที่กำลังทำงานยังไม่ถูกสร้าง กรุณาสร้างตามคำแนะนำใน Console Log");
        } else {
          setError("ไม่สามารถดึงข้อมูลรายการที่กำลังทำงานได้");
        }
      } else {
        setError("ไม่สามารถดึงข้อมูลรายการที่กำลังทำงานได้");
      }
    } finally {
      setLoadingTimers(false);
    }
  };

  const fetchMessageTemplates = async () => {
    setLoadingMessages(true);
    try {
      const templatesCol = collection(db, 'stores', STORE_ID, 'message_templates');
      const templateSnapshot = await getDocs(templatesCol);
      const templateList = templateSnapshot.docs.map(doc => ({
        docId: doc.id,
        ...doc.data()
      })) as MessageTemplate[];
      templateList.sort((a, b) => a.id.localeCompare(b.id));
      setMessageTemplates(templateList);
    } catch (err) {
      console.error("Error fetching message templates:", err);
      setError("ไม่สามารถดึงข้อมูลข้อความแจ้งเตือนได้");
    } finally {
      setLoadingMessages(false);
    }
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === ADMIN_PASSWORD) {
      setLoggedIn(true);
      setError('');
    } else {
      setError('รหัสผ่านไม่ถูกต้อง');
      setLoggedIn(false);
    }
  };

  const handleEditMachineClick = (machine: MachineConfig) => {
    setEditingMachineId(machine.id);
    setEditMachineFormData({
      duration_minutes: machine.duration_minutes,
      is_active: machine.is_active,
    });
  };

  const handleSaveMachineClick = async (machineDocId: string) => {
    try {
      const machineRef = doc(db, 'stores', STORE_ID, 'machine_configs', machineDocId);
      await updateDoc(machineRef, {
        duration_minutes: editMachineFormData.duration_minutes,
        is_active: editMachineFormData.is_active,
      });
      await fetchMachineConfigs();
      setEditingMachineId(null);
    } catch (err) {
      console.error("Error updating machine config:", err);
      setError("ไม่สามารถบันทึกการเปลี่ยนแปลงได้");
    }
  };
  
  // === FIX #1: เพิ่มฟังก์ชันสำหรับลบเครื่องจักร ===
  const handleDeleteMachine = async (machineDocId: string, machineDisplayName: string) => {
    if (window.confirm(`คุณแน่ใจหรือไม่ที่จะลบเครื่อง "${machineDisplayName}" ออกจากระบบ? การกระทำนี้ไม่สามารถย้อนกลับได้`)) {
      try {
        const machineRef = doc(db, 'stores', STORE_ID, 'machine_configs', machineDocId);
        await deleteDoc(machineRef);
        alert(`ลบเครื่อง ${machineDisplayName} เรียบร้อยแล้ว`);
        await fetchMachineConfigs(); // โหลดข้อมูลใหม่
      } catch (err) {
        console.error("Error deleting machine:", err);
        setError("เกิดข้อผิดพลาดในการลบเครื่องจักร");
      }
    }
  };

  const handleCancelMachineEdit = () => {
    setEditingMachineId(null);
  };

  const handleCancelTimer = async (timerId: string, machineDisplayName: string) => {
    if (window.confirm(`คุณแน่ใจหรือไม่ที่จะยกเลิกการจับเวลาของ ${machineDisplayName} (ID: ${timerId})?`)) {
      try {
        const response = await fetch('/api/admin/timers/cancel', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ timerId, storeId: STORE_ID }),
        });

        if (response.ok) {
          alert(`ยกเลิกการจับเวลาของ ${machineDisplayName} เรียบร้อยแล้ว`);
          await fetchActiveTimers();
        } else {
          const errorData = await response.json();
          alert(`ไม่สามารถยกเลิกได้: ${errorData.message || 'เกิดข้อผิดพลาด'}`);
        }
      } catch (err) {
        console.error("Error cancelling timer:", err);
        alert("เกิดข้อผิดพลาดในการยกเลิกการจับเวลา");
      }
    }
  };

  const handleAddMachineClick = () => {
    setAddingNewMachine(true);
    setNewMachineFormData({
      machine_id: '',
      machine_type: 'washer',
      duration_minutes: '',
      is_active: true,
      display_name: ''
    });
  };

  const handleSaveNewMachine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMachineFormData.machine_id || !newMachineFormData.display_name || !newMachineFormData.duration_minutes) {
      alert('กรุณากรอกข้อมูลให้ครบถ้วน');
      return;
    }
    const parsedMachineId = parseInt(String(newMachineFormData.machine_id), 10);
    const parsedDuration = parseInt(String(newMachineFormData.duration_minutes), 10);
    if (isNaN(parsedMachineId) || parsedMachineId <= 0 || isNaN(parsedDuration) || parsedDuration <= 0) {
      alert('หมายเลขเครื่องและเวลาต้องเป็นตัวเลขที่ถูกต้องและมากกว่า 0');
      return;
    }

    try {
      const machineConfigsCol = collection(db, 'stores', STORE_ID, 'machine_configs');
      const existingMachine = await getDocs(query(
        machineConfigsCol,
        where('machine_id', '==', parsedMachineId),
        where('machine_type', '==', newMachineFormData.machine_type)
      ));
      if (!existingMachine.empty) {
        alert(`เครื่องประเภท ${newMachineFormData.machine_type} หมายเลข ${parsedMachineId} มีอยู่ในระบบแล้ว`);
        return;
      }

      await addDoc(machineConfigsCol, {
        machine_id: parsedMachineId,
        machine_type: newMachineFormData.machine_type,
        duration_minutes: parsedDuration,
        is_active: newMachineFormData.is_active,
        display_name: newMachineFormData.display_name
      });
      alert('เพิ่มเครื่องใหม่เรียบร้อยแล้ว');
      setAddingNewMachine(false);
      await fetchMachineConfigs();
    } catch (err) {
      console.error("Error adding new machine:", err);
      setError("ไม่สามารถเพิ่มเครื่องใหม่ได้");
    }
  };

  const handleCancelNewMachine = () => {
    setAddingNewMachine(false);
  };

  const handleEditMessageClick = (template: MessageTemplate) => {
    setEditingMessageId(template.docId);
    setEditMessageFormData(template.text);
  };

  const handleSaveMessageClick = async (templateDocId: string) => {
    try {
      const templateRef = doc(db, 'stores', STORE_ID, 'message_templates', templateDocId);
      await updateDoc(templateRef, {
        text: editMessageFormData,
      });
      await fetchMessageTemplates();
      setEditingMessageId(null);
    } catch (err) {
      console.error("Error updating message template:", err);
      setError("ไม่สามารถบันทึกข้อความได้");
    }
  };

  const handleCancelMessageEdit = () => {
    setEditingMessageId(null);
  };

  if (loggedIn) {
    return (
      <div className="container" style={{ maxWidth: '100%', padding: '10px', margin: '10px auto' }}>
        <div className="card">
          <h1 style={{ color: 'var(--primary-pink)', fontSize: '1.8em' }}>
            <span style={{ fontSize: '1.5em', verticalAlign: 'middle', marginRight: '10px' }}>⚙️</span>
            แผงควบคุมผู้ดูแล
          </h1>
          <p style={{ color: 'var(--text-dark)', marginBottom: '15px', fontSize: '0.9em' }}>จัดการการตั้งค่าเครื่องซักผ้า-อบผ้า และข้อความแจ้งเตือนของร้าน</p>

          <button
            className="line-button"
            style={{ backgroundColor: 'var(--dark-pink)', marginBottom: '20px', padding: '10px 20px', fontSize: '1em' }}
            onClick={() => setLoggedIn(false)}
          >
            <span style={{ fontSize: '1.2em', verticalAlign: 'middle', marginRight: '5px' }}>🚪</span>
            ออกจากระบบ
          </button>

          {error && <p style={{ color: '#dc3545', marginBottom: '15px', fontWeight: 'bold', fontSize: '0.9em' }}>{error}</p>}

          <h2 style={{ color: 'var(--dark-pink)', marginTop: '20px', marginBottom: '15px', fontSize: '1.4em' }}>
            <span style={{ fontSize: '1.2em', verticalAlign: 'middle', marginRight: '5px' }}>🔧</span>
            การตั้งค่าเครื่องจักร
          </h2>
          {loadingMachines ? (
            <p style={{ fontSize: '0.9em' }}>กำลังโหลดข้อมูลเครื่องจักร...</p>
          ) : (
            <div className="machine-list" style={{ textAlign: 'left', overflowX: 'auto' }}>
              {machines.length === 0 ? (
                <p style={{ textAlign: 'center', color: '#777', fontSize: '0.9em' }}>ไม่พบข้อมูลเครื่องจักร</p>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '10px', fontSize: '0.9em' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--light-pink)' }}>
                      <th style={{ padding: '8px', textAlign: 'left', color: 'var(--dark-pink)' }}>เครื่อง</th>
                      <th style={{ padding: '8px', textAlign: 'left', color: 'var(--dark-pink)' }}>ประเภท</th>
                      <th style={{ padding: '8px', textAlign: 'left', color: 'var(--dark-pink)' }}>เวลา (นาที)</th>
                      <th style={{ padding: '8px', textAlign: 'left', color: 'var(--text-dark)' }}>ใช้งานอยู่</th>
                      <th style={{ padding: '8px', textAlign: 'right', color: 'var(--dark-pink)' }}>จัดการ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {machines.map(machine => (
                      <tr key={machine.id} style={{ borderBottom: '1px dashed #eee' }}>
                        <td style={{ padding: '8px', fontWeight: 'bold' }}>{machine.display_name}</td>
                        <td style={{ padding: '8px' }}>{machine.machine_type === 'washer' ? 'ซักผ้า' : 'อบผ้า'}</td>
                        <td style={{ padding: '8px' }}>
                          {editingMachineId === machine.id ? (
                            <input
                              type="number"
                              value={editMachineFormData.duration_minutes}
                              onChange={(e) => setEditMachineFormData({ ...editMachineFormData, duration_minutes: parseInt(e.target.value) || 0 })}
                              style={{ width: '50px', padding: '4px', borderRadius: '4px', border: '1px solid #ccc', fontSize: '0.9em' }}
                            />
                          ) : (
                            machine.duration_minutes
                          )}
                        </td>
                        <td style={{ padding: '8px' }}>
                          {editingMachineId === machine.id ? (
                            <input
                              type="checkbox"
                              checked={editMachineFormData.is_active}
                              onChange={(e) => setEditMachineFormData({ ...editMachineFormData, is_active: e.target.checked })}
                              style={{ transform: 'scale(1.2)' }}
                            />
                          ) : (
                            machine.is_active ?
                              <span style={{ color: 'var(--line-green)', fontWeight: 'bold' }}>✅</span> :
                              <span style={{ color: '#dc3545', fontWeight: 'bold' }}>❌</span>
                          )}
                        </td>
                        <td style={{ padding: '8px', textAlign: 'right' }}>
                          {editingMachineId === machine.id ? (
                            <>
                              <button
                                className="line-button"
                                style={{ backgroundColor: 'var(--line-green)', padding: '6px 10px', fontSize: '0.8em', marginRight: '5px' }}
                                onClick={() => handleSaveMachineClick(machine.id)}
                              >
                                บันทึก
                              </button>
                              <button
                                className="line-button"
                                style={{ backgroundColor: '#6c757d', padding: '5px 8px', fontSize: '0.8em' }}
                                onClick={handleCancelMachineEdit}
                              >
                                ยกเลิก
                              </button>
                            </>
                          ) : (
                            // === FIX #2: เพิ่มปุ่ม "แก้ไข" และ "ลบ" ===
                            <div style={{display: 'flex', gap: '5px', justifyContent: 'flex-end'}}>
                                <button
                                  className="line-button"
                                  style={{ backgroundColor: 'var(--primary-pink)', padding: '5px 8px', fontSize: '0.8em' }}
                                  onClick={() => handleEditMachineClick(machine)}
                                >
                                  แก้ไข
                                </button>
                                <button
                                  className="line-button"
                                  style={{ backgroundColor: '#dc3545', padding: '5px 8px', fontSize: '0.8em' }}
                                  onClick={() => handleDeleteMachine(machine.id, machine.display_name)}
                                >
                                  ลบ
                                </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Add New Machine Section */}
          <h2 style={{ color: 'var(--dark-pink)', marginTop: '30px', marginBottom: '15px', fontSize: '1.4em' }}>
            <span style={{ fontSize: '1.2em', verticalAlign: 'middle', marginRight: '5px' }}>➕</span>
            เพิ่มเครื่องใหม่
          </h2>
          {addingNewMachine ? (
            <form onSubmit={handleSaveNewMachine} style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '300px', margin: '0 auto', fontSize: '0.9em' }}>
              <label style={{ textAlign: 'left', fontWeight: 'bold' }}>หมายเลขเครื่อง (ID):</label>
              <input
                type="number"
                placeholder="เช่น 1, 5, 10"
                value={newMachineFormData.machine_id}
                onChange={(e) => setNewMachineFormData({ ...newMachineFormData, machine_id: e.target.value })}
                style={{ padding: '8px', borderRadius: '5px', border: '1px solid #ccc' }}
              />
              <label style={{ textAlign: 'left', fontWeight: 'bold' }}>ประเภท:</label>
              <select
                value={newMachineFormData.machine_type}
                onChange={(e) => setNewMachineFormData({ ...newMachineFormData, machine_type: e.target.value as 'washer' | 'dryer' })}
                style={{ padding: '8px', borderRadius: '5px', border: '1px solid #ccc' }}
              >
                <option value="washer">ซักผ้า</option>
                <option value="dryer">อบผ้า</option>
              </select>
              <label style={{ textAlign: 'left', fontWeight: 'bold' }}>เวลาที่ใช้ (นาที):</label>
              <input
                type="number"
                placeholder="เช่น 25, 40"
                value={newMachineFormData.duration_minutes}
                onChange={(e) => setNewMachineFormData({ ...newMachineFormData, duration_minutes: e.target.value })}
                style={{ padding: '8px', borderRadius: '5px', border: '1px solid #ccc' }}
              />
              <label style={{ textAlign: 'left', fontWeight: 'bold' }}>ชื่อแสดงผล (หน้า Bot):</label>
              <input
                type="text"
                placeholder="เช่น เครื่องซักผ้า #5, เครื่องอบผ้า (40 นาที)"
                value={newMachineFormData.display_name}
                onChange={(e) => setNewMachineFormData({ ...newMachineFormData, display_name: e.target.value })}
                style={{ padding: '8px', borderRadius: '5px', border: '1px solid #ccc' }}
              />
              <label style={{display: 'flex', alignItems: 'center', textAlign: 'left', fontWeight: 'bold'}}>
                <input
                  type="checkbox"
                  checked={newMachineFormData.is_active}
                  onChange={(e) => setNewMachineFormData({ ...newMachineFormData, is_active: e.target.checked })}
                  style={{ transform: 'scale(1.2)', marginRight: '10px' }}
                /> เปิดใช้งาน
              </label>

              <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginTop: '20px' }}>
                <button
                  type="submit"
                  className="line-button"
                  style={{ backgroundColor: 'var(--line-green)', padding: '8px 15px', fontSize: '0.9em' }}
                >
                  บันทึกเครื่องใหม่
                </button>
                <button
                  type="button"
                  className="line-button"
                  style={{ backgroundColor: '#6c757d', padding: '8px 15px', fontSize: '0.9em' }}
                  onClick={handleCancelNewMachine}
                >
                  ยกเลิก
                </button>
              </div>
            </form>
          ) : (
            <button
              className="line-button"
              style={{ backgroundColor: 'var(--primary-pink)', padding: '10px 20px', fontSize: '1em', marginTop: '10px' }}
              onClick={handleAddMachineClick}
            >
              เพิ่มเครื่องใหม่
            </button>
          )}

          {/* Active Timers Section */}
          <h2 style={{ color: 'var(--dark-pink)', marginTop: '30px', marginBottom: '15px', fontSize: '1.4em' }}>
            <span style={{ fontSize: '1.2em', verticalAlign: 'middle', marginRight: '5px' }}>⏱️</span>
            รายการเครื่องที่กำลังทำงาน
          </h2>
          {loadingTimers ? (
            <p style={{ fontSize: '0.9em' }}>กำลังโหลดรายการที่กำลังทำงาน...</p>
          ) : (
            <div className="active-timers-list" style={{ textAlign: 'left', overflowX: 'auto' }}>
              {activeTimers.length === 0 ? (
                <p style={{ textAlign: 'center', color: '#777', fontSize: '0.9em' }}>ไม่มีเครื่องใดกำลังทำงานอยู่</p>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '10px', fontSize: '0.9em' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--light-pink)' }}>
                      <th style={{ padding: '8px', textAlign: 'left', color: 'var(--dark-pink)' }}>เครื่อง</th>
                      <th style={{ padding: '8px', textAlign: 'left', color: 'var(--dark-pink)' }}>เริ่มโดย</th>
                      <th style={{ padding: '8px', textAlign: 'left', color: 'var(--dark-pink)' }}>เสร็จใน</th>
                      <th style={{ padding: '8px', textAlign: 'right', color: 'var(--dark-pink)' }}>จัดการ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeTimers.map(timer => (
                      <tr key={timer.id} style={{ borderBottom: '1px dashed #eee' }}>
                        <td style={{ padding: '8px', fontWeight: 'bold' }}>{timer.display_name} ({timer.duration_minutes} นาที)</td>
                        <td style={{ padding: '8px', fontSize: '0.9em' }}>{timer.user_id.substring(0, 8)}...</td>
                        <td style={{ padding: '8px' }}>{new Date(timer.end_time.seconds * 1000).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</td>
                        <td style={{ padding: '8px', textAlign: 'right' }}>
                          <button
                            className="line-button"
                            style={{ backgroundColor: '#dc3545', padding: '6px 10px', fontSize: '0.8em' }}
                            onClick={() => handleCancelTimer(timer.id, timer.display_name)}
                          >
                            ยกเลิกการจับเวลา
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Message Templates Section */}
          <h2 style={{ color: 'var(--dark-pink)', marginTop: '30px', marginBottom: '15px', fontSize: '1.4em' }}>
            <span style={{ fontSize: '1.2em', verticalAlign: 'middle', marginRight: '5px' }}>💬</span>
            ข้อความแจ้งเตือนและตอบกลับ
          </h2>
          {loadingMessages ? (
            <p style={{ fontSize: '0.9em' }}>กำลังโหลดข้อความ...</p>
          ) : (
            <div className="message-templates-list" style={{ textAlign: 'left', overflowX: 'auto' }}>
              {messageTemplates.length === 0 ? (
                <p style={{ textAlign: 'center', color: '#777', fontSize: '0.9em' }}>ไม่พบข้อมูลข้อความ กรุณาเพิ่มใน Firebase Console</p>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '10px', fontSize: '0.9em' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--light-pink)' }}>
                      <th style={{ padding: '8px', textAlign: 'left', color: 'var(--dark-pink)' }}>ประเภทข้อความ (ID)</th>
                      <th style={{ padding: '8px', textAlign: 'left', color: 'var(--dark-pink)' }}>เนื้อหาข้อความ</th>
                      <th style={{ padding: '8px', textAlign: 'right', color: 'var(--dark-pink)' }}>จัดการ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {messageTemplates.map(template => (
                      <tr key={template.docId} style={{ borderBottom: '1px dashed #eee' }}>
                        <td style={{ padding: '8px', fontWeight: 'bold', fontSize: '0.8em', verticalAlign: 'top' }}>{template.id}</td>
                        <td style={{ padding: '8px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                          {editingMessageId === template.docId ? (
                            <textarea
                              value={editMessageFormData}
                              onChange={(e) => setEditMessageFormData(e.target.value)}
                              rows={4}
                              style={{ width: '100%', padding: '4px', borderRadius: '4px', border: '1px solid #ccc', resize: 'vertical', fontSize: '1em' }}
                            />
                          ) : (
                            template.text
                          )}
                        </td>
                        <td style={{ padding: '8px', textAlign: 'right', verticalAlign: 'top' }}>
                          {editingMessageId === template.docId ? (
                            <>
                              <button
                                className="line-button"
                                style={{ backgroundColor: 'var(--line-green)', padding: '6px 10px', fontSize: '0.8em', marginRight: '5px', display: 'block', width: '100%' }}
                                onClick={() => handleSaveMessageClick(template.docId)}
                              >
                                บันทึก
                              </button>
                              <button
                                className="line-button"
                                style={{ backgroundColor: '#6c757d', padding: '6px 10px', fontSize: '0.8em', marginTop: '5px', display: 'block', width: '100%' }}
                                onClick={handleCancelMessageEdit}
                              >
                                ยกเลิก
                              </button>
                            </>
                          ) : (
                            <button
                              className="line-button"
                              style={{ backgroundColor: 'var(--primary-pink)', padding: '6px 10px', fontSize: '0.8em' }}
                              onClick={() => handleEditMessageClick(template)}
                            >
                              แก้ไข
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

        </div>
      </div>
    );
  }

  // --- Admin Login Page Content ---
  return (
    <div className="container" style={{ maxWidth: '100%', padding: '10px', margin: '10px auto' }}>
      <div className="card">
        <h1 style={{ fontSize: '1.8em' }}>เข้าสู่ระบบผู้ดูแล</h1>
        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <input
            type="password"
            placeholder="กรุณาใส่รหัสผ่าน"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{
              padding: '10px',
              margin: '10px 0',
              borderRadius: '6px',
              border: '1px solid #ddd',
              width: '90%',
              maxWidth: '250px',
              fontSize: '0.9em'
            }}
          />
          {error && <p style={{ color: '#dc3545', fontSize: '0.8em', marginBottom: '10px' }}>{error}</p>}
          <button
            type="submit"
            className="line-button"
            style={{ backgroundColor: '#007bff', padding: '10px 20px', fontSize: '1em' }}
          >
            เข้าสู่ระบบ
          </button>
        </form>
      </div>
    </div>
  );
}