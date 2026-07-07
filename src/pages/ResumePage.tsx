import { LogIn, Mail, MapPin, Phone, Settings } from 'lucide-react'
import { Link as RouterLink } from 'react-router-dom'
import TopbarNav from '../components/TopbarNav'
import TopbarUserMenu from '../components/TopbarUserMenu'
import ThemeToggle from '../components/ThemeToggle'
import { useAuth } from '../context/AuthContext'
import {
  resumeAwards,
  resumeEducation,
  resumeProfile,
  resumeProjects,
  resumeSkills,
  resumeStrengths,
  resumeWork,
} from '../data/resume'
import '../styles/topbar.css'
import '../styles/resume.css'

function SectionTitle({ children }: { children: string }) {
  return (
    <div className="resume-section-title">
      <span className="resume-section-title__bar" aria-hidden="true" />
      <h2>{children}</h2>
    </div>
  )
}

export default function ResumePage() {
  const auth = useAuth()

  return (
    <div className="resume-page">
      <header className="topbar">
        <RouterLink to="/" className="topbar-brand" aria-label="返回首页">
          <span className="brand-dot" />
          <span>我的导航</span>
        </RouterLink>

        <TopbarNav />

        <div className="topbar-actions" aria-label="站点操作">
          {auth.token ? (
            <RouterLink to="/admin" className="topbar-action">
              <Settings size={16} />
              <span>管理</span>
            </RouterLink>
          ) : (
            <RouterLink to="/login" className="topbar-action" state={{ from: '/resume' }}>
              <LogIn size={16} />
              <span>登录</span>
            </RouterLink>
          )}
          <ThemeToggle />
          {auth.token && <TopbarUserMenu />}
        </div>
      </header>

      <main className="resume-page__main">
        <div className="resume-paper">
          <section className="resume-header">
            <h1>{resumeProfile.name}</h1>
            <p className="resume-header__role">{resumeProfile.role}</p>

            <div className="resume-contact-row">
              <a href={`tel:${resumeProfile.phone}`}>
                <Phone size={14} />
                <span>{resumeProfile.phone}</span>
              </a>
              <a href={`mailto:${resumeProfile.email}`}>
                <Mail size={14} />
                <span>{resumeProfile.email}</span>
              </a>
            </div>

            <div className="resume-contact-row resume-contact-row--muted">
              <span>{resumeProfile.status}</span>
              <span>{resumeProfile.location}</span>
              <span>{resumeProfile.salary}</span>
              <span>{resumeProfile.degree}</span>
            </div>

            <div className="resume-contact-row resume-contact-row--muted">
              <span>
                <MapPin size={14} />
                {resumeProfile.location}
              </span>
              <a href={resumeProfile.site} target="_blank" rel="noreferrer">
                {resumeProfile.site}
              </a>
            </div>

            <p className="resume-header__summary">{resumeProfile.summary}</p>
          </section>

          <section className="resume-section">
            <SectionTitle>教育经历</SectionTitle>
            <article className="resume-entry">
              <div className="resume-entry__head">
                <h3>
                  {resumeEducation.school} {resumeEducation.major} {resumeEducation.degree}
                </h3>
                <span>{resumeEducation.date}</span>
              </div>
              <p className="resume-entry__meta">{resumeEducation.meta}</p>
              <ul className="resume-list">
                {resumeEducation.achievements.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
          </section>

          <section className="resume-section">
            <SectionTitle>专业技能</SectionTitle>
            <div className="resume-label">Java</div>
            <ul className="resume-list">
              {resumeSkills.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>

          <section className="resume-section">
            <SectionTitle>工作经历</SectionTitle>
            <article className="resume-entry">
              <div className="resume-entry__head">
                <h3>{resumeWork.company}</h3>
                <span>{resumeWork.date}</span>
              </div>
              <p className="resume-entry__meta">
                {resumeWork.title} {resumeWork.location}
              </p>
              <p className="resume-entry__body">{resumeWork.description}</p>
              <div className="resume-label">主要职责</div>
              <ul className="resume-list">
                {resumeWork.responsibilities.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
          </section>

          <section className="resume-section">
            <SectionTitle>项目经历</SectionTitle>
            <div className="resume-projects">
              {resumeProjects.map((project) => (
                <article key={project.name} className="resume-entry">
                  <div className="resume-entry__head">
                    <h3>{project.name}</h3>
                    <span>{project.date}</span>
                  </div>
                  <p className="resume-entry__meta">{project.role}</p>
                  <p className="resume-entry__body">{project.summary}</p>
                  <ul className="resume-list">
                    {project.bullets.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </section>

          <section className="resume-section resume-section--split">
            <div>
              <SectionTitle>荣誉奖项</SectionTitle>
              <div className="resume-awards">
                {resumeAwards.map((item) => (
                  <article key={item.name} className="resume-award">
                    <strong>{item.name}</strong>
                    <span>{item.date}</span>
                  </article>
                ))}
              </div>
            </div>

            <div>
              <SectionTitle>个人亮点</SectionTitle>
              <ul className="resume-list">
                {resumeStrengths.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}
