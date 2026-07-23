import { useState, useEffect } from 'react';
import { Card, Button, Input, Select, Tag, Space, Table, Modal, Form, message, Drawer, Timeline, Popconfirm } from 'antd';
import { PlusOutlined, SearchOutlined, FilterOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import { taskApi, ideaApi, productApi, userApi } from '../api';
import { useAuthStore } from '../store';
import dayjs from 'dayjs';

const statusMap: Record<string, { color: string; text: string }> = {
  PENDING: { color: 'default', text: '待分配' },
  ASSIGNED: { color: 'blue', text: '待写作' },
  WRITING: { color: 'processing', text: '写作中' },
  PENDING_REVIEW: { color: 'orange', text: '待审核' },
  MODIFYING: { color: 'warning', text: '修改中' },
  CONTENT_APPROVED: { color: 'cyan', text: '文案已通过' },
  PENDING_DESIGN: { color: 'purple', text: '待设计' },
  DESIGNING: { color: 'purple', text: '设计中' },
  PENDING_FINAL: { color: 'magenta', text: '待终审' },
  PENDING_PUBLISH: { color: 'gold', text: '待发布' },
  PUBLISHED: { color: 'green', text: '已发布' },
  PENDING_REVIEW_DATA: { color: 'lime', text: '待复盘' },
  COMPLETED: { color: 'green', text: '已完成' },
};

const priorityMap: Record<string, { color: string; text: string }> = {
  LOW: { color: 'default', text: '低' },
  NORMAL: { color: 'blue', text: '普通' },
  HIGH: { color: 'orange', text: '高' },
  URGENT: { color: 'red', text: '紧急' },
};

export default function Tasks() {
  const { user } = useAuthStore();
  const isManager = ['ADMIN', 'CONTENT_MANAGER'].includes(user?.role || '');
  const [tasks, setTasks] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);
  const [currentTask, setCurrentTask] = useState<any>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [keyword, setKeyword] = useState('');
  const [products, setProducts] = useState<any[]>([]);
  const [carModels, setCarModels] = useState<any[]>([]);
  const [writers, setWriters] = useState<any[]>([]);
  const [adoptedIdeas, setAdoptedIdeas] = useState<any[]>([]);
  const [form] = Form.useForm();

  useEffect(() => {
    fetchData();
    fetchOptions();
  }, [statusFilter, keyword]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const params: any = { pageSize: 20 };
      if (statusFilter) params.status = statusFilter;
      if (keyword) params.keyword = keyword;
      const res = await taskApi.list(params);
      setTasks(res.data.tasks);
      setTotal(res.data.total);
    } catch (err) {
      message.error('获取任务列表失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchOptions = async () => {
    try {
      const [productsRes, carModelsRes, usersRes, ideasRes] = await Promise.all([
        productApi.list({ pageSize: 100 }),
        productApi.getCarModels(),
        userApi.list({ role: 'WRITER', pageSize: 100 }),
        ideaApi.list({ status: 'ADOPTED', pageSize: 100 }),
      ]);
      setProducts(productsRes.data.products);
      setCarModels(carModelsRes.data);
      setWriters(usersRes.data.users);
      setAdoptedIdeas(ideasRes.data.ideas);
    } catch {}
  };

  const handleCreate = async (values: any) => {
    try {
      await taskApi.create(values);
      message.success('创建成功');
      setModalVisible(false);
      form.resetFields();
      fetchData();
    } catch (err: any) {
      message.error(err.response?.data?.error || '创建失败');
    }
  };

  const handleStatusChange = async (id: string, status: string) => {
    try {
      await taskApi.updateStatus(id, status);
      message.success('状态更新成功');
      fetchData();
    } catch (err: any) {
      message.error(err.response?.data?.error || '状态更新失败');
    }
  };

  const columns = [
    { title: '任务名称', dataIndex: 'title', ellipsis: true, width: 200 },
    { title: '关联选题', dataIndex: 'idea', render: (i: any) => i?.title || '-' },
    { title: '产品', dataIndex: 'productRelation', render: (p: any) => p?.name || '-' },
    { title: '车型', dataIndex: 'carModelRelation', render: (m: any) => m ? `${m.brand?.name || ''} ${m.name}` : '-' },
    {
      title: '优先级',
      dataIndex: 'priority',
      width: 80,
      render: (p: string) => <Tag color={priorityMap[p]?.color}>{priorityMap[p]?.text || p}</Tag>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 120,
      render: (s: string) => <Tag color={statusMap[s]?.color}>{statusMap[s]?.text || s}</Tag>,
    },
    {
      title: '负责人',
      dataIndex: 'members',
      width: 120,
      render: (members: any[]) => members?.map(m => m.user?.name).join(', ') || '-',
    },
    { title: '计划发布', dataIndex: 'planPublishAt', width: 100, render: (d: string) => d ? dayjs(d).format('YYYY-MM-DD') : '-' },
    {
      title: '操作',
      width: 150,
      render: (_: any, record: any) => (
        <Space>
          <Button size="small" type="link" onClick={(e) => { e.stopPropagation(); setCurrentTask(record); setDetailVisible(true); }}>详情</Button>
          {isManager && (
            <Select size="small" style={{ width: 100 }} placeholder="改状态" onChange={(v) => handleStatusChange(record.id, v)}>
              {Object.entries(statusMap).map(([k, v]) => <Select.Option key={k} value={k}>{v.text}</Select.Option>)}
            </Select>
          )}
        </Space>
      ),
    },
  ];

  return (
    <Card
      title="内容任务"
      extra={
        <Space>
          <Input.Search placeholder="搜索任务" onSearch={setKeyword} style={{ width: 200 }} />
          <Select placeholder="状态筛选" allowClear style={{ width: 120 }} onChange={setStatusFilter}>
            {Object.entries(statusMap).map(([k, v]) => <Select.Option key={k} value={k}>{v.text}</Select.Option>)}
          </Select>
          {isManager && <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalVisible(true)}>创建任务</Button>}
        </Space>
      }
    >
      <Table
        dataSource={tasks}
        columns={columns}
        rowKey="id"
        loading={loading}
        pagination={{ total, pageSize: 20, showSizeChanger: false }}
        onRow={(record) => ({ onClick: () => { setCurrentTask(record); setDetailVisible(true); }, style: { cursor: 'pointer' } })}
      />

      <Modal title="创建任务" open={modalVisible} onCancel={() => setModalVisible(false)} footer={null} width={600}>
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          <Form.Item name="title" label="任务名称" rules={[{ required: true, message: '请输入任务名称' }]}>
            <Input placeholder="请输入任务名称" />
          </Form.Item>
          <Form.Item name="ideaId" label="关联选题">
            <Select placeholder="选择选题" allowClear showSearch>
              {adoptedIdeas.map(i => <Select.Option key={i.id} value={i.id}>{i.title}</Select.Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="contentType" label="内容形式">
            <Select placeholder="选择内容形式">
              <Select.Option value="种草">种草</Select.Option>
              <Select.Option value="测评">测评</Select.Option>
              <Select.Option value="教程">教程</Select.Option>
              <Select.Option value="对比">对比</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="productId" label="对应产品">
            <Select placeholder="选择产品" allowClear>
              {products.map(p => <Select.Option key={p.id} value={p.id}>{p.name}</Select.Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="carModelId" label="对应车型">
            <Select placeholder="选择车型" allowClear showSearch>
              {carModels.map(m => <Select.Option key={m.id} value={m.id}>{m.brand?.name} {m.name}</Select.Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="priority" label="优先级" initialValue="NORMAL">
            <Select>
              {Object.entries(priorityMap).map(([k, v]) => <Select.Option key={k} value={k}>{v.text}</Select.Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="writerId" label="写手">
            <Select placeholder="选择写手" allowClear>
              {writers.map(w => <Select.Option key={w.id} value={w.id}>{w.name}</Select.Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="planPublishAt" label="计划发布日期">
            <Input type="date" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block>创建</Button>
          </Form.Item>
        </Form>
      </Modal>

      <Drawer title="任务详情" open={detailVisible} onClose={() => setDetailVisible(false)} width={600}>
        {currentTask && (
          <div>
            <h3>{currentTask.title}</h3>
            <Space style={{ marginBottom: 16 }}>
              <Tag color={priorityMap[currentTask.priority]?.color}>{priorityMap[currentTask.priority]?.text}</Tag>
              <Tag color={statusMap[currentTask.status]?.color}>{statusMap[currentTask.status]?.text}</Tag>
            </Space>

            <p><strong>关联选题：</strong>{currentTask.idea?.title || '-'}</p>
            <p><strong>产品：</strong>{currentTask.productRelation?.name || '-'}</p>
            <p><strong>车型：</strong>{currentTask.carModelRelation ? `${currentTask.carModelRelation.brand?.name || ''} ${currentTask.carModelRelation.name}` : '-'}</p>
            <p><strong>计划发布：</strong>{currentTask.planPublishAt ? dayjs(currentTask.planPublishAt).format('YYYY-MM-DD') : '-'}</p>
            <p><strong>写作截止：</strong>{currentTask.writingDeadline ? dayjs(currentTask.writingDeadline).format('YYYY-MM-DD') : '-'}</p>
            <p><strong>最终截止：</strong>{currentTask.finalDeadline ? dayjs(currentTask.finalDeadline).format('YYYY-MM-DD') : '-'}</p>

            <h4 style={{ marginTop: 24 }}>负责人</h4>
            {currentTask.members?.length > 0 ? (
              <ul>
                {currentTask.members.map((m: any) => (
                  <li key={m.id}>{m.user?.name} - {m.role}</li>
                ))}
              </ul>
            ) : <p>暂无负责人</p>}

            <h4 style={{ marginTop: 24 }}>状态历史</h4>
            <Timeline
              items={currentTask.statusLogs?.map((log: any) => ({
                color: log.toStatus === 'PUBLISHED' ? 'green' : 'blue',
                children: (
                  <div>
                    <Tag color={statusMap[log.toStatus]?.color}>{statusMap[log.toStatus]?.text}</Tag>
                    <span> by {log.operator?.name}</span>
                    <div style={{ fontSize: 12, color: '#999' }}>{dayjs(log.createdAt).format('YYYY-MM-DD HH:mm')}</div>
                    {log.note && <div>{log.note}</div>}
                  </div>
                ),
              }))}
            />
          </div>
        )}
      </Drawer>
    </Card>
  );
}
