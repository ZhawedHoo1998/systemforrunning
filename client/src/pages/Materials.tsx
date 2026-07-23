import { useState, useEffect } from 'react';
import { Table, Card, Button, Input, Select, Tag, Space, Modal, Form, message, Upload, Image } from 'antd';
import { PlusOutlined, SearchOutlined, UploadOutlined, DownloadOutlined, PictureOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { materialApi, productApi } from '../api';

const materialTypes = [
  '产品白底图', '产品安装图', '产品细节图', '产品包装图',
  '车型内饰图', '车型外观图', '产品视频', '安装视频',
  '使用场景视频', '用户好评截图', '私信咨询截图', '评论区问题',
  '香型描述', '产品卖点', '标题模板', '封面模板',
  '竞品笔记', '爆款案例', '品牌资料', '其他'
];

export default function Materials() {
  const [materials, setMaterials] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [keyword, setKeyword] = useState('');
  const [products, setProducts] = useState<any[]>([]);
  const [carModels, setCarModels] = useState<any[]>([]);
  const [fragrances, setFragrances] = useState<any[]>([]);
  const [tags, setTags] = useState<any[]>([]);
  const [form] = Form.useForm();

  useEffect(() => {
    fetchData();
    fetchOptions();
  }, [typeFilter, keyword]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const params: any = { pageSize: 20 };
      if (typeFilter) params.type = typeFilter;
      if (keyword) params.keyword = keyword;
      const res = await materialApi.list(params);
      setMaterials(res.data.materials);
      setTotal(res.data.total);
    } catch (err) {
      message.error('获取素材列表失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchOptions = async () => {
    try {
      const [productsRes, carModelsRes, fragrancesRes, tagsRes] = await Promise.all([
        productApi.list({ pageSize: 100 }),
        productApi.getCarModels(),
        productApi.getFragrances(),
        productApi.getTags(),
      ]);
      setProducts(productsRes.data.products);
      setCarModels(carModelsRes.data);
      setFragrances(fragrancesRes.data);
      setTags(tagsRes.data);
    } catch {}
  };

  const handleCreate = async (values: any) => {
    try {
      await materialApi.create(values);
      message.success('创建成功');
      setModalVisible(false);
      form.resetFields();
      fetchData();
    } catch (err: any) {
      message.error(err.response?.data?.error || '创建失败');
    }
  };

  const handleUse = async (id: string) => {
    try {
      await materialApi.use(id);
      fetchData();
    } catch {}
  };

  const columns = [
    {
      title: '素材',
      key: 'preview',
      width: 100,
      render: (_: any, record: any) =>
        record.url ? (
          record.type?.includes('视频') ? (
            <VideoPreview url={record.url} />
          ) : (
            <Image src={record.url} width={60} height={60} style={{ objectFit: 'cover' }} />
          )
        ) : (
          <PictureOutlined style={{ fontSize: 24, color: '#ccc' }} />
        ),
    },
    { title: '素材名称', dataIndex: 'name', ellipsis: true },
    { title: '类型', dataIndex: 'type', width: 120 },
    { title: '产品', dataIndex: 'product', render: (p: any) => p?.name || '-' },
    { title: '车型', dataIndex: 'carModel', render: (m: any) => m ? `${m.brand?.name || ''} ${m.name}` : '-' },
    {
      title: '标签',
      dataIndex: 'tags',
      width: 200,
      render: (tags: any[]) => tags?.slice(0, 3).map((t: any) => <Tag key={t.id}>{t.name}</Tag>),
    },
    { title: '上传人', dataIndex: 'uploadr', render: (u: any) => u?.name || '-' },
    { title: '使用次数', dataIndex: 'useCount', width: 80 },
    { title: '上传时间', dataIndex: 'createdAt', width: 120, render: (d: string) => d ? dayjs(d).format('YYYY-MM-DD') : '-' },
    {
      title: '操作',
      width: 100,
      render: (_: any, record: any) => (
        <Space>
          <Button size="small" type="link" onClick={(e) => { e.stopPropagation(); handleUse(record.id); }}>使用</Button>
          {record.url && <Button size="small" type="link" icon={<DownloadOutlined />} href={record.url} target="_blank">下载</Button>}
        </Space>
      ),
    },
  ];

  return (
    <Card
      title="素材中心"
      extra={
        <Space>
          <Input.Search placeholder="搜索素材" onSearch={setKeyword} style={{ width: 200 }} />
          <Select placeholder="类型筛选" allowClear style={{ width: 150 }} onChange={setTypeFilter}>
            {materialTypes.map(t => <Select.Option key={t} value={t}>{t}</Select.Option>)}
          </Select>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalVisible(true)}>上传素材</Button>
        </Space>
      }
    >
      <Table
        dataSource={materials}
        columns={columns}
        rowKey="id"
        loading={loading}
        pagination={{ total, pageSize: 20, showSizeChanger: false }}
      />

      <Modal title="上传素材" open={modalVisible} onCancel={() => setModalVisible(false)} footer={null} width={600}>
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          <Form.Item name="name" label="素材名称" rules={[{ required: true, message: '请输入素材名称' }]}>
            <Input placeholder="请输入素材名称" />
          </Form.Item>
          <Form.Item name="type" label="素材类型" rules={[{ required: true, message: '请选择素材类型' }]}>
            <Select placeholder="选择素材类型">
              {materialTypes.map(t => <Select.Option key={t} value={t}>{t}</Select.Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="url" label="素材文件">
            <Input placeholder="输入文件URL或上传" />
          </Form.Item>
          <Form.Item name="textContent" label="文字内容">
            <Input.TextArea rows={3} placeholder="如果素材包含文字内容，请输入" />
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
          <Form.Item name="scene" label="使用场景">
            <Input placeholder="如：日常通勤、长途自驾" />
          </Form.Item>
          <Form.Item name="canPublish" label="是否可直接发布" valuePropName="checked">
            <Select placeholder="是否可直接发布">
              <Select.Option value={true}>是</Select.Option>
              <Select.Option value={false}>否</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block>上传</Button>
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}

function VideoPreview({ url }: { url: string }) {
  return <video src={url} width={60} height={60} style={{ objectFit: 'cover' }} />;
}
