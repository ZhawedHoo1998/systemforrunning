import { useState, useEffect } from 'react';
import { Table, Card, Button, Input, Select, Tag, Space, Modal, Form, message, Tabs, Image, Row, Col } from 'antd';
import { PlusOutlined, ShopOutlined, CarOutlined, HeartOutlined, TagOutlined } from '@ant-design/icons';
import { productApi } from '../api';
import { useAuthStore } from '../store';

const statusMap: Record<string, { color: string; text: string }> = {
  ACTIVE: { color: 'green', text: '在售' },
  NEW: { color: 'blue', text: '新品' },
  PENDING: { color: 'orange', text: '待上架' },
  OUT_OF_STOCK: { color: 'red', text: '缺货' },
  OFFLINE: { color: 'default', text: '下架' },
  DISCONTINUED: { color: 'default', text: '停产' },
};

export default function Products() {
  const { user } = useAuthStore();
  const isManager = ['ADMIN', 'CONTENT_MANAGER'].includes(user?.role || '');
  const [activeTab, setActiveTab] = useState('products');
  const [products, setProducts] = useState<any[]>([]);
  const [brands, setBrands] = useState<any[]>([]);
  const [carModels, setCarModels] = useState<any[]>([]);
  const [fragrances, setFragrances] = useState<any[]>([]);
  const [tags, setTags] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [currentType, setCurrentType] = useState('');
  const [form] = Form.useForm();

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  const fetchData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'products') {
        const res = await productApi.list({ pageSize: 100 });
        setProducts(res.data.products);
      } else if (activeTab === 'brands') {
        const res = await productApi.getBrands();
        setBrands(res.data);
      } else if (activeTab === 'carModels') {
        const res = await productApi.getCarModels();
        setCarModels(res.data);
      } else if (activeTab === 'fragrances') {
        const res = await productApi.getFragrances();
        setFragrances(res.data);
      } else if (activeTab === 'tags') {
        const res = await productApi.getTags();
        setTags(res.data);
      }
    } catch (err) {
      message.error('获取数据失败');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (values: any) => {
    try {
      if (activeTab === 'products') {
        await productApi.create(values);
      } else if (activeTab === 'brands') {
        await productApi.createBrand(values);
      } else if (activeTab === 'carModels') {
        await productApi.createCarModel(values);
      } else if (activeTab === 'fragrances') {
        await productApi.createFragrance(values);
      } else if (activeTab === 'tags') {
        await productApi.createTag(values);
      }
      message.success('创建成功');
      setModalVisible(false);
      form.resetFields();
      fetchData();
    } catch (err: any) {
      message.error(err.response?.data?.error || '创建失败');
    }
  };

  const productColumns = [
    { title: '产品名称', dataIndex: 'name', width: 150 },
    { title: '产品编号', dataIndex: 'code', width: 100 },
    { title: '产品系列', dataIndex: 'series', width: 100 },
    {
      title: '状态',
      dataIndex: 'status',
      width: 80,
      render: (s: string) => <Tag color={statusMap[s]?.color}>{statusMap[s]?.text || s}</Tag>,
    },
    { title: '零售价', dataIndex: 'price', render: (p: number) => p ? `¥${p}` : '-' },
    { title: '活动价', dataIndex: 'salePrice', render: (p: number) => p ? `¥${p}` : '-' },
    { title: '库存', dataIndex: 'stock', width: 80 },
    {
      title: '适配车型',
      dataIndex: 'carModels',
      render: (models: any[]) => models?.slice(0, 2).map((m: any) => m.carModel?.name).join(', ') || '-',
    },
  ];

  const brandColumns = [
    { title: '品牌名称', dataIndex: 'name' },
    { title: 'Logo', dataIndex: 'logo', render: (l: string) => l ? <Image src={l} width={40} /> : '-' },
    { title: '车型数量', dataIndex: 'carModels', render: (models: any[]) => models?.length || 0 },
  ];

  const carModelColumns = [
    { title: '品牌', dataIndex: 'brand', render: (b: any) => b?.name || '-' },
    { title: '车型名称', dataIndex: 'name' },
    { title: '车型系列', dataIndex: 'series' },
    { title: '年款', dataIndex: 'year' },
    { title: '内饰风格', dataIndex: 'interiorStyle' },
  ];

  const fragranceColumns = [
    { title: '香型名称', dataIndex: 'name' },
    { title: '描述', dataIndex: 'description', ellipsis: true },
  ];

  const tagColumns = [
    { title: '标签名称', dataIndex: 'name' },
    { title: '颜色', dataIndex: 'color', render: (c: string) => c ? <Tag color={c}>{c}</Tag> : '-' },
  ];

  const getColumns = () => {
    switch (activeTab) {
      case 'products': return productColumns;
      case 'brands': return brandColumns;
      case 'carModels': return carModelColumns;
      case 'fragrances': return fragranceColumns;
      case 'tags': return tagColumns;
      default: return [];
    }
  };

  const getData = () => {
    switch (activeTab) {
      case 'products': return products;
      case 'brands': return brands;
      case 'carModels': return carModels;
      case 'fragrances': return fragrances;
      case 'tags': return tags;
      default: return [];
    }
  };

  const getModalTitle = () => {
    const map: Record<string, string> = {
      products: '创建产品',
      brands: '创建品牌',
      carModels: '创建车型',
      fragrances: '创建香型',
      tags: '创建标签',
    };
    return map[activeTab] || '创建';
  };

  return (
    <Card
      title="产品与车型库"
      extra={
        isManager && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalVisible(true)}>
            新建{activeTab === 'products' ? '产品' : activeTab === 'brands' ? '品牌' : activeTab === 'carModels' ? '车型' : activeTab === 'fragrances' ? '香型' : '标签'}
          </Button>
        )
      }
    >
      <Tabs
        activeKey={activeTab}
        onChange={(key) => { setActiveTab(key); setModalVisible(false); }}
        items={[
          { key: 'products', label: <span><ShopOutlined /> 产品</span> },
          { key: 'brands', label: <span><HeartOutlined /> 品牌</span> },
          { key: 'carModels', label: <span><CarOutlined /> 车型</span> },
          { key: 'fragrances', label: <span><HeartOutlined /> 香型</span> },
          { key: 'tags', label: <span><TagOutlined /> 素材标签</span> },
        ]}
      />

      <Table
        dataSource={getData()}
        columns={getColumns()}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 20 }}
      />

      <Modal
        title={getModalTitle()}
        open={modalVisible}
        onCancel={() => { setModalVisible(false); form.resetFields(); }}
        footer={null}
        width={500}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          {activeTab === 'products' && (
            <>
              <Form.Item name="name" label="产品名称" rules={[{ required: true, message: '请输入产品名称' }]}>
                <Input placeholder="请输入产品名称" />
              </Form.Item>
              <Form.Item name="code" label="产品编号">
                <Input placeholder="请输入产品编号" />
              </Form.Item>
              <Form.Item name="series" label="产品系列">
                <Input placeholder="请输入产品系列" />
              </Form.Item>
              <Form.Item name="status" label="状态" initialValue="ACTIVE">
                <Select>
                  {Object.entries(statusMap).map(([k, v]) => <Select.Option key={k} value={k}>{v.text}</Select.Option>)}
                </Select>
              </Form.Item>
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item name="price" label="零售价">
                    <Input type="number" placeholder="0.00" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="salePrice" label="活动价">
                    <Input type="number" placeholder="0.00" />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item name="stock" label="库存" initialValue={0}>
                <Input type="number" />
              </Form.Item>
              <Form.Item name="highlights" label="核心卖点">
                <Input.TextArea rows={2} placeholder="请输入核心卖点" />
              </Form.Item>
              <Form.Item name="installMethod" label="安装方法">
                <Input.TextArea rows={2} placeholder="请输入安装方法" />
              </Form.Item>
            </>
          )}
          {activeTab === 'brands' && (
            <Form.Item name="name" label="品牌名称" rules={[{ required: true, message: '请输入品牌名称' }]}>
              <Input placeholder="请输入品牌名称" />
            </Form.Item>
          )}
          {activeTab === 'carModels' && (
            <>
              <Form.Item name="brandId" label="所属品牌" rules={[{ required: true, message: '请选择品牌' }]}>
                <Select placeholder="选择品牌">
                  {brands.map(b => <Select.Option key={b.id} value={b.id}>{b.name}</Select.Option>)}
                </Select>
              </Form.Item>
              <Form.Item name="name" label="车型名称" rules={[{ required: true, message: '请输入车型名称' }]}>
                <Input placeholder="请输入车型名称" />
              </Form.Item>
              <Form.Item name="series" label="车型系列">
                <Input placeholder="请输入车型系列" />
              </Form.Item>
              <Form.Item name="year" label="年款">
                <Input placeholder="如：2024款" />
              </Form.Item>
              <Form.Item name="interiorStyle" label="内饰风格">
                <Input placeholder="如：运动风格、简约风格" />
              </Form.Item>
            </>
          )}
          {activeTab === 'fragrances' && (
            <>
              <Form.Item name="name" label="香型名称" rules={[{ required: true, message: '请输入香型名称' }]}>
                <Input placeholder="请输入香型名称" />
              </Form.Item>
              <Form.Item name="description" label="描述">
                <Input.TextArea rows={3} placeholder="请输入香型描述" />
              </Form.Item>
            </>
          )}
          {activeTab === 'tags' && (
            <>
              <Form.Item name="name" label="标签名称" rules={[{ required: true, message: '请输入标签名称' }]}>
                <Input placeholder="请输入标签名称" />
              </Form.Item>
              <Form.Item name="color" label="颜色">
                <Input type="color" style={{ width: 100 }} />
              </Form.Item>
            </>
          )}
          <Form.Item>
            <Button type="primary" htmlType="submit" block>创建</Button>
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
