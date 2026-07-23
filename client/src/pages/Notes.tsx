import { useState, useEffect } from 'react';
import { Card, Button, Input, Select, Tag, Space, Table, Modal, Form, message, Drawer, Statistic, Row, Col, Tabs, Image } from 'antd';
import { PlusOutlined, SearchOutlined, EyeOutlined, LikeOutlined, StarOutlined, MessageOutlined, SendOutlined, ShoppingCartOutlined } from '@ant-design/icons';
import { noteApi, productApi, userApi } from '../api';
import { useAuthStore } from '../store';
import dayjs from 'dayjs';

const titleStructureOptions = [
  '提问型', '避坑型', '劝告型', '对比型', '数字清单型',
  '身份标签型', '情绪型', '结果型', '悬念型', '车型直接型', '其他'
];

const coverTypeOptions = [
  '产品特写', '车辆内饰', '安装效果', '人物加产品', '文字封面',
  '前后对比', '多图拼接', '场景图', '其他'
];

export default function Notes() {
  const { user } = useAuthStore();
  const isManager = ['ADMIN', 'CONTENT_MANAGER', 'DATA_OPERATOR'].includes(user?.role || '');
  const [notes, setNotes] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);
  const [currentNote, setCurrentNote] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('list');
  const [keyword, setKeyword] = useState('');
  const [products, setProducts] = useState<any[]>([]);
  const [carModels, setCarModels] = useState<any[]>([]);
  const [fragrances, setFragrances] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [form] = Form.useForm();

  useEffect(() => {
    fetchData();
    fetchOptions();
  }, [keyword, activeTab]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const params: any = { pageSize: 20 };
      if (keyword) params.keyword = keyword;
      const res = await noteApi.list(params);
      setNotes(res.data.notes);
      setTotal(res.data.total);
    } catch (err) {
      message.error('获取笔记列表失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchOptions = async () => {
    try {
      const [productsRes, carModelsRes, fragrancesRes, accountsRes] = await Promise.all([
        productApi.list({ pageSize: 100 }),
        productApi.getCarModels(),
        productApi.getFragrances(),
        noteApi.getAccounts(),
      ]);
      setProducts(productsRes.data.products);
      setCarModels(carModelsRes.data);
      setFragrances(fragrancesRes.data);
      setAccounts(accountsRes.data);
    } catch {}
  };

  const handleCreate = async (values: any) => {
    try {
      await noteApi.create(values);
      message.success('创建成功');
      setModalVisible(false);
      form.resetFields();
      fetchData();
    } catch (err: any) {
      message.error(err.response?.data?.error || '创建失败');
    }
  };

  const handleViewAnalysis = async (record: any) => {
    try {
      const res = await noteApi.getAnalysis(record.id);
      setCurrentNote({ ...record, analysis: res.data });
      setDetailVisible(true);
    } catch (err) {
      message.error('获取分析失败');
    }
  };

  const columns = [
    { title: '笔记标题', dataIndex: 'finalTitle', ellipsis: true, width: 200 },
    { title: '账号', dataIndex: 'account', render: (a: any) => a?.name || '-' },
    { title: '发布时间', dataIndex: 'publishedAt', width: 100, render: (d: string) => d ? dayjs(d).format('YYYY-MM-DD') : '-' },
    { title: '产品', dataIndex: 'product', render: (p: any) => p?.name || '-' },
    { title: '车型', dataIndex: 'carModel', render: (m: any) => m ? `${m.brand?.name || ''} ${m.name}` : '-' },
    { title: '香型', dataIndex: 'fragrance', render: (f: any) => f?.name || '-' },
    {
      title: '最新数据',
      key: 'latestMetrics',
      width: 200,
      render: (_: any, record: any) => {
        const latest = record.metrics?.[0];
        if (!latest) return <Tag>待回填</Tag>;
        return (
          <Space size="small">
            <Tooltip title="阅读量"><span><EyeOutlined /> {latest.views}</span></Tooltip>
            <Tooltip title="点赞"><span><LikeOutlined /> {latest.likes}</span></Tooltip>
            <Tooltip title="收藏"><span><StarOutlined /> {latest.collects}</span></Tooltip>
            <Tooltip title="评论"><span><MessageOutlined /> {latest.comments}</span></Tooltip>
          </Space>
        );
      },
    },
    {
      title: '操作',
      width: 100,
      render: (_: any, record: any) => (
        <Button size="small" type="link" onClick={(e) => { e.stopPropagation(); handleViewAnalysis(record); }}>详情</Button>
      ),
    },
  ];

  return (
    <Card
      title="发布笔记库"
      extra={
        <Space>
          <Input.Search placeholder="搜索笔记" onSearch={setKeyword} style={{ width: 200 }} />
          {isManager && <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalVisible(true)}>登记笔记</Button>}
        </Space>
      }
    >
      <Table
        dataSource={notes}
        columns={columns}
        rowKey="id"
        loading={loading}
        pagination={{ total, pageSize: 20, showSizeChanger: false }}
        onRow={(record) => ({ onClick: () => handleViewAnalysis(record), style: { cursor: 'pointer' } })}
      />

      <Modal title="登记笔记" open={modalVisible} onCancel={() => setModalVisible(false)} footer={null} width={600}>
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          <Form.Item name="title" label="笔记标题" rules={[{ required: true, message: '请输入笔记标题' }]}>
            <Input placeholder="请输入笔记标题" />
          </Form.Item>
          <Form.Item name="accountId" label="发布账号" rules={[{ required: true, message: '请选择发布账号' }]}>
            <Select placeholder="选择发布账号">
              {accounts.map(a => <Select.Option key={a.id} value={a.id}>{a.name}</Select.Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="url" label="笔记链接">
            <Input placeholder="请输入小红书笔记链接" />
          </Form.Item>
          <Form.Item name="publishedAt" label="发布时间">
            <Input type="date" />
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
          <Form.Item name="contentType" label="内容形式">
            <Select placeholder="选择内容形式">
              <Select.Option value="种草">种草</Select.Option>
              <Select.Option value="测评">测评</Select.Option>
              <Select.Option value="教程">教程</Select.Option>
              <Select.Option value="对比">对比</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="titleStructure" label="标题结构">
            <Select placeholder="选择标题结构">
              {titleStructureOptions.map(t => <Select.Option key={t} value={t}>{t}</Select.Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="coverType" label="封面类型">
            <Select placeholder="选择封面类型">
              {coverTypeOptions.map(t => <Select.Option key={t} value={t}>{t}</Select.Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="isPaid" label="是否投流" valuePropName="checked">
            <Select placeholder="是否投流">
              <Select.Option value={true}>是</Select.Option>
              <Select.Option value={false}>否</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="paidAmount" label="投流金额">
            <Input type="number" placeholder="0.00" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block>登记</Button>
          </Form.Item>
        </Form>
      </Modal>

      <Drawer title="笔记详情" open={detailVisible} onClose={() => setDetailVisible(false)} width={700}>
        {currentNote && (
          <div>
            <h3>{currentNote.finalTitle || currentNote.title}</h3>
            <Space style={{ marginBottom: 16 }}>
              <Tag>{currentNote.account?.name}</Tag>
              {currentNote.publishedAt && <Tag>{dayjs(currentNote.publishedAt).format('YYYY-MM-DD')}</Tag>}
              {currentNote.isPaid && <Tag color="red">已投流 ¥{currentNote.paidAmount}</Tag>}
            </Space>

            <Row gutter={16} style={{ marginBottom: 24 }}>
              <Col span={6}><Statistic title="阅读量" value={currentNote.metrics?.[0]?.views || 0} prefix={<EyeOutlined />} /></Col>
              <Col span={6}><Statistic title="点赞" value={currentNote.metrics?.[0]?.likes || 0} prefix={<LikeOutlined />} /></Col>
              <Col span={6}><Statistic title="收藏" value={currentNote.metrics?.[0]?.collects || 0} prefix={<StarOutlined />} /></Col>
              <Col span={6}><Statistic title="评论" value={currentNote.metrics?.[0]?.comments || 0} prefix={<MessageOutlined />} /></Col>
            </Row>

            <Row gutter={16} style={{ marginBottom: 24 }}>
              <Col span={8}><Statistic title="新增粉丝" value={currentNote.metrics?.[0]?.newFollowers || 0} /></Col>
              <Col span={8}><Statistic title="私信数" value={currentNote.metrics?.[0]?.私信数 || 0} prefix={<SendOutlined />} /></Col>
              <Col span={8}><Statistic title="成交订单" value={currentNote.metrics?.[0]?.orders || 0} prefix={<ShoppingCartOutlined />} /></Col>
            </Row>

            {currentNote.analysis?.calculated && (
              <>
                <h4>转化指标</h4>
                <Row gutter={16}>
                  <Col span={8}><Statistic title="互动率" value={currentNote.analysis.calculated.interactionRate} /></Col>
                  <Col span={8}><Statistic title="收藏率" value={currentNote.analysis.calculated.collectRate} /></Col>
                  <Col span={8}><Statistic title="私信转化率" value={currentNote.analysis.calculated.dmRate} /></Col>
                  <Col span={8}><Statistic title="商品点击率" value={currentNote.analysis.calculated.productClickRate} /></Col>
                  <Col span={8}><Statistic title="成交转化率" value={currentNote.analysis.calculated.orderRate} /></Col>
                  <Col span={8}><Statistic title="投入产出比" value={currentNote.analysis.calculated.roi} /></Col>
                </Row>
              </>
            )}

            <h4 style={{ marginTop: 24 }}>基本信息</h4>
            <p><strong>产品：</strong>{currentNote.productRelation?.name || '-'}</p>
            <p><strong>车型：</strong>{currentNote.carModelRelation ? `${currentNote.carModelRelation.brand?.name || ''} ${currentNote.carModelRelation.name}` : '-'}</p>
            <p><strong>香型：</strong>{currentNote.fragrance?.name || '-'}</p>
            <p><strong>内容形式：</strong>{currentNote.contentType || '-'}</p>
            <p><strong>标题结构：</strong>{currentNote.titleStructure || '-'}</p>
            <p><strong>封面类型：</strong>{currentNote.coverType || '-'}</p>
          </div>
        )}
      </Drawer>
    </Card>
  );
}
