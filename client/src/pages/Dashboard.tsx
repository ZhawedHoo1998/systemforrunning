import { useState, useEffect } from 'react';
import { Row, Col, Card, Statistic, List, Tag, Progress, Table, Button } from 'antd';
import {
  BulbOutlined,
  CheckCircleOutlined,
  FileTextOutlined,
  EyeOutlined,
  LikeOutlined,
  StarOutlined,
  MessageOutlined,
  UserAddOutlined,
  SendOutlined,
  ShoppingCartOutlined,
  RocketOutlined,
} from '@ant-design/icons';
import { dashboardApi } from '../api';
import { useNavigate } from 'react-router-dom';
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
};

export default function Dashboard() {
  const [overview, setOverview] = useState<any>(null);
  const [weekly, setWeekly] = useState<any>(null);
  const [todos, setTodos] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([
      dashboardApi.getOverview(),
      dashboardApi.getWeekly(),
      dashboardApi.getMyTodos(),
    ])
      .then(([overviewRes, weeklyRes, todosRes]) => {
        setOverview(overviewRes.data);
        setWeekly(weeklyRes.data);
        setTodos(todosRes.data);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return null;

  return (
    <div>
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card>
            <Statistic
              title="本月新增选题"
              value={overview?.monthIdeas || 0}
              prefix={<BulbOutlined style={{ color: '#667eea' }} />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="本月采用选题"
              value={overview?.monthAdoptedIdeas || 0}
              prefix={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="本月发布笔记"
              value={overview?.monthPublishedNotes || 0}
              prefix={<FileTextOutlined style={{ color: '#1890ff' }} />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="本月总阅读量"
              value={overview?.monthViews || 0}
              prefix={<EyeOutlined style={{ color: '#faad14' }} />}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card>
            <Statistic
              title="本月总点赞"
              value={overview?.monthLikes || 0}
              prefix={<LikeOutlined style={{ color: '#f5222d' }} />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="本月总收藏"
              value={overview?.monthCollects || 0}
              prefix={<StarOutlined style={{ color: '#fa8c16' }} />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="本月新增粉丝"
              value={overview?.monthNewFollowers || 0}
              prefix={<UserAddOutlined style={{ color: '#722ed1' }} />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="本月私信数"
              value={overview?.monthDMs || 0}
              prefix={<SendOutlined style={{ color: '#13c2c2' }} />}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card>
            <Statistic
              title="本月成交订单"
              value={overview?.monthOrders || 0}
              prefix={<ShoppingCartOutlined style={{ color: '#eb2f96' }} />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="本月成交金额"
              value={`¥${(overview?.monthOrderAmount || 0).toLocaleString()}`}
              prefix={<RocketOutlined style={{ color: '#52c41a' }} />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="本月投流金额"
              value={`¥${(overview?.monthPaidAmount || 0).toLocaleString()}`}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="平均互动率"
              value={overview?.avgInteractionRate || '0%'}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col span={12}>
          <Card title="我的待办" extra={<Button type="link" onClick={() => navigate('/tasks')}>查看全部</Button>}>
            <List
              size="small"
              dataSource={[
                { label: '待写作任务', value: todos?.pendingWriting?.length || 0, color: '#1890ff' },
                { label: '待修改任务', value: todos?.pendingModify?.length || 0, color: '#faad14' },
                { label: '待设计任务', value: todos?.pendingDesign?.length || 0, color: '#722ed1' },
                { label: '待审核任务', value: todos?.pendingReview?.length || 0, color: '#13c2c2' },
                { label: '已逾期任务', value: todos?.overdueTasks?.length || 0, color: '#f5222d' },
                { label: '待回填数据', value: todos?.pendingDataFill || 0, color: '#fa8c16' },
              ]}
              renderItem={(item: any) => (
                <List.Item>
                  <span style={{ color: item.color }}>{item.label}</span>
                  <Tag color={item.color}>{item.value}</Tag>
                </List.Item>
              )}
            />
          </Card>
        </Col>
        <Col span={12}>
          <Card title="本周概况">
            <Row gutter={16}>
              <Col span={12}>
                <Statistic title="新增选题" value={weekly?.weekIdeas || 0} />
              </Col>
              <Col span={12}>
                <Statistic title="采用选题" value={weekly?.weekAdoptedIdeas || 0} />
              </Col>
              <Col span={12}>
                <Statistic title="已发布笔记" value={weekly?.weekPublishedNotes || 0} />
              </Col>
              <Col span={12}>
                <Statistic title="总阅读量" value={weekly?.weekViews || 0} />
              </Col>
            </Row>
          </Card>
        </Col>
      </Row>

      {todos?.overdueTasks?.length > 0 && (
        <Card title="已逾期任务" style={{ marginTop: 24 }}>
          <Table
            size="small"
            dataSource={todos.overdueTasks}
            rowKey="id"
            pagination={false}
            columns={[
              { title: '任务名称', dataIndex: 'title' },
              { title: '状态', dataIndex: 'status', render: (s: string) => <Tag color={statusMap[s]?.color}>{statusMap[s]?.text || s}</Tag> },
              { title: '截止日期', dataIndex: 'finalDeadline', render: (d: string) => d ? dayjs(d).format('YYYY-MM-DD') : '-' },
            ]}
            onRow={(record) => ({ onClick: () => navigate(`/tasks/${record.id}`), style: { cursor: 'pointer' } })}
          />
        </Card>
      )}
    </div>
  );
}
