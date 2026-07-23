import { useState, useEffect } from 'react';
import { Table, Card, Button, Input, Select, Tag, Space, Modal, Form, message, Popconfirm, Rate, Tooltip } from 'antd';
import { PlusOutlined, SearchOutlined, LikeOutlined, MessageOutlined, FilterOutlined } from '@ant-design/icons';
import { ideaApi, productApi } from '../api';
import { useAuthStore } from '../store';
import dayjs from 'dayjs';

const { TextArea } = Input;

const statusMap: Record<string, { color: string; text: string }> = {
  PENDING: { color: 'default', text: '待评审' },
  ADOPTED: { color: 'green', text: '已采用' },
  REJECTED: { color: 'red', text: '已拒绝' },
  NEED_MORE: { color: 'orange', text: '待补充' },
  POSTPONED: { color: 'purple', text: '暂缓' },
  TASK_CREATED: { color: 'cyan', text: '已创建任务' },
  COMPLETED: { color: 'blue', text: '已完成' },
};

const priorityMap: Record<string, { color: string; text: string }> = {
  S: { color: 'red', text: 'S级' },
  A: { color: 'orange', text: 'A级' },
  B: { color: 'blue', text: 'B级' },
  C: { color: 'default', text: 'C级' },
};

export default function Ideas() {
  const [ideas, setIdeas] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);
  const [currentIdea, setCurrentIdea] = useState<any>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [keyword, setKeyword] = useState('');
  const [form] = Form.useForm();
  const { user } = useAuthStore();
  const [products, setProducts] = useState<any[]>([]);
  const [carModels, setCarModels] = useState<any[]>([]);
  const [fragrances, setFragrances] = useState<any[]>([]);

  const isManager = ['ADMIN', 'CONTENT_MANAGER'].includes(user?.role || '');

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
      const res = await ideaApi.list(params);
      setIdeas(res.data.ideas);
      setTotal(res.data.total);
    } catch (err) {
      message.error('获取选题列表失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchOptions = async () => {
    try {
      const [productsRes, carModelsRes, fragrancesRes] = await Promise.all([
        productApi.list({ pageSize: 100 }),
        productApi.getCarModels(),
        productApi.getFragrances(),
      ]);
      setProducts(productsRes.data.products);
      setCarModels(carModelsRes.data);
      setFragrances(fragrancesRes.data);
    } catch {}
  };

  const handleCreate = async (values: any) => {
    try {
      await ideaApi.create(values);
      message.success('创建成功');
      setModalVisible(false);
      form.resetFields();
      fetchData();
    } catch (err: any) {
      message.error(err.response?.data?.error || '创建失败');
    }
  };

  const handleVote = async (id: string) => {
    try {
      await ideaApi.vote(id);
      fetchData();
    } catch (err) {
      message.error('投票失败');
    }
  };

  const handleReview = async (id: string, status: string) => {
    try {
      await ideaApi.review(id, { status });
      message.success('审核成功');
      fetchData();
    } catch (err: any) {
      message.error(err.response?.data?.error || '审核失败');
    }
  };

  const columns = [
    { title: '选题名称', dataIndex: 'title', ellipsis: true, width: 200 },
    { title: '内容分类', dataIndex: 'contentType', width: 100 },
    { title: '产品', dataIndex: 'product', render: (p: any) => p?.name || '-' },
    { title: '车型', dataIndex: 'carModel', render: (m: any) => m ? `${m.brand?.name || ''} ${m.name}` : '-' },
    { title: '香型', dataIndex: 'fragrance', render: (f: any) => f?.name || '-' },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (s: string) => <Tag color={statusMap[s]?.color}>{statusMap[s]?.text || s}</Tag>,
    },
    {
      title: '优先级',
      dataIndex: 'priority',
      width: 80,
      render: (p: string, record: any) => {
        if (!isManager || !record.score) return p ? <Tag color={priorityMap[p]?.color}>{priorityMap[p]?.text}</Tag> : '-';
        return (
          <Tooltip title={`评分: ${record.score}/30`}>
            <Tag color={priorityMap[p]?.color}>{priorityMap[p]?.text || p}</Tag>
          </Tooltip>
        );
      },
    },
    { title: '提交人', dataIndex: 'creator', render: (c: any) => c?.name || '-' },
    {
      title: '投票',
      dataIndex: '_count',
      width: 80,
      render: (_: any, record: any) => (
        <span onClick={(e) => { e.stopPropagation(); handleVote(record.id); }} style={{ cursor: 'pointer' }}>
          <LikeOutlined /> {record._count?.votes || 0}
        </span>
      ),
    },
    { title: '评论', dataIndex: '_count', render: (_: any, record: any) => record._count?.comments || 0 },
    { title: '提交时间', dataIndex: 'createdAt', width: 120, render: (d: string) => dayjs(d).format('YYYY-MM-DD') },
    {
      title: '操作',
      width: 150,
      render: (_: any, record: any) => (
        isManager && record.status === 'PENDING' ? (
          <Space>
            <Button size="small" type="link" onClick={(e) => { e.stopPropagation(); handleReview(record.id, 'ADOPTED'); }}>通过</Button>
            <Button size="small" type="link" danger onClick={(e) => { e.stopPropagation(); handleReview(record.id, 'REJECTED'); }}>拒绝</Button>
          </Space>
        ) : null
      ),
    },
  ];

  return (
    <Card
      title="选题创意库"
      extra={
        <Space>
          <Input.Search placeholder="搜索选题" onSearch={setKeyword} style={{ width: 200 }} />
          <Select placeholder="状态筛选" allowClear style={{ width: 120 }} onChange={setStatusFilter}>
            {Object.entries(statusMap).map(([k, v]) => <Select.Option key={k} value={k}>{v.text}</Select.Option>)}
          </Select>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalVisible(true)}>提交选题</Button>
        </Space>
      }
    >
      <Table
        dataSource={ideas}
        columns={columns}
        rowKey="id"
        loading={loading}
        pagination={{ total, pageSize: 20, showSizeChanger: false }}
        onRow={(record) => ({ onClick: () => { setCurrentIdea(record); setDetailVisible(true); }, style: { cursor: 'pointer' } })}
      />

      <Modal title="提交选题" open={modalVisible} onCancel={() => setModalVisible(false)} footer={null} width={600}>
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          <Form.Item name="title" label="选题名称" rules={[{ required: true, message: '请输入选题名称' }]}>
            <Input placeholder="请输入选题名称" />
          </Form.Item>
          <Form.Item name="summary" label="一句话思路">
            <TextArea rows={2} placeholder="用一句话描述选题思路" />
          </Form.Item>
          <Form.Item name="contentType" label="内容分类">
            <Select placeholder="选择内容分类">
              <Select.Option value="种草">种草</Select.Option>
              <Select.Option value="测评">测评</Select.Option>
              <Select.Option value="教程">教程</Select.Option>
              <Select.Option value="对比">对比</Select.Option>
              <Select.Option value="选购指南">选购指南</Select.Option>
              <Select.Option value="使用体验">使用体验</Select.Option>
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
          <Form.Item name="fragranceId" label="对应香型">
            <Select placeholder="选择香型" allowClear>
              {fragrances.map(f => <Select.Option key={f.id} value={f.id}>{f.name}</Select.Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="targetUser" label="目标人群">
            <Input placeholder="如：30岁男性车主" />
          </Form.Item>
          <Form.Item name="scene" label="使用场景">
            <Input placeholder="如：日常通勤、长途自驾" />
          </Form.Item>
          <Form.Item name="painPoint" label="用户痛点">
            <TextArea rows={2} placeholder="描述目标用户的痛点" />
          </Form.Item>
          <Form.Item name="corePoint" label="核心观点">
            <TextArea rows={2} placeholder="选题的核心观点" />
          </Form.Item>
          <Form.Item name="titleIdeas" label="标题想法">
            <TextArea rows={2} placeholder="多个标题想法用换行分隔" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block>提交</Button>
          </Form.Item>
        </Form>
      </Modal>

      <Modal title="选题详情" open={detailVisible} onCancel={() => setDetailVisible(false)} footer={null} width={700}>
        {currentIdea && (
          <div>
            <h3>{currentIdea.title}</h3>
            <Space style={{ marginBottom: 16 }}>
              <Tag color={statusMap[currentIdea.status]?.color}>{statusMap[currentIdea.status]?.text}</Tag>
              {currentIdea.priority && <Tag color={priorityMap[currentIdea.priority]?.color}>{priorityMap[currentIdea.priority]?.text}</Tag>}
              {currentIdea.score && <span>评分: {currentIdea.score}/30</span>}
            </Space>
            {currentIdea.summary && <p><strong>一句话思路：</strong>{currentIdea.summary}</p>}
            {currentIdea.painPoint && <p><strong>用户痛点：</strong>{currentIdea.painPoint}</p>}
            {currentIdea.corePoint && <p><strong>核心观点：</strong>{currentIdea.corePoint}</p>}
            {currentIdea.titleIdeas && <p><strong>标题想法：</strong></p>}
            {currentIdea.titleIdeas?.split('\n').map((t: string, i: number) => t && <Tag key={i}>{t}</Tag>)}
          </div>
        )}
      </Modal>
    </Card>
  );
}
